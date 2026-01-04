import React, { useEffect, useMemo, useState } from 'react'
import { listStocksByWarehouse, listWarehouses, type StockDto, type WarehouseDto } from '../../api/wbStocksClient'
import type { OpenApiStrategyId } from '../../api/wbOpenApiClient'
import { useToast } from '../../components/Toast'

type TransferSuggestion = {
  skuKey: string
  title: string
  fromWarehouse: string
  toWarehouse: string
  qty: number
  reason: string
  etaDays: number
}

type TransferJob = {
  id: string
  skuKey: string
  qty: number
  fromWarehouse: string
  toWarehouse: string
  status: 'queued' | 'sent' | 'error'
  message?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000

function normalizeWarehouse(w: WarehouseDto): { id: number; name: string } | null {
  const id = Number(w?.id ?? w?.warehouseId)
  if (!Number.isFinite(id)) return null
  const name = String(w?.name ?? w?.officeName ?? `Склад ${id}`)
  return { id, name }
}

function normalizeStock(s: StockDto): { skuKey: string; title: string; qty: number } | null {
  const qty = Number(s?.quantity ?? s?.amount ?? s?.stock ?? 0)
  const skuKey = String(s?.sku ?? s?.barcode ?? s?.nmId ?? '').trim()
  if (!skuKey) return null
  const title = String(s?.title ?? s?.itemName ?? s?.subject ?? `SKU ${skuKey}`)
  return { skuKey, title, qty: Number.isFinite(qty) ? qty : 0 }
}

function cacheKey(accountId: string) {
  return `wb_stock_transfer_cache_v1_${accountId}`
}

export default function StockTransfersPage({
  accountId,
  sellerToken,
  openApiStrategyId,
}: {
  accountId: string
  sellerToken: string
  openApiStrategyId?: OpenApiStrategyId
}) {
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([])
  const [stocksByWarehouse, setStocksByWarehouse] = useState<Record<number, Array<{ skuKey: string; title: string; qty: number }>>>({})
  const [suggestions, setSuggestions] = useState<TransferSuggestion[]>([])
  const [jobs, setJobs] = useState<TransferJob[]>([])
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneSession, setPhoneSession] = useState<string | null>(null)
  const [smsStatus, setSmsStatus] = useState('Ожидание запроса SMS-кода')
  const [smsCooldownUntil, setSmsCooldownUntil] = useState<number | null>(null)
  const [manualStatus, setManualStatus] = useState('Ожидание входа')
  const [manualSessionId, setManualSessionId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ ts: string; level: string; message: string }>>([])
  const [plan, setPlan] = useState<Array<{ skuKey: string; fromWarehouse: string; toWarehouse: string; qty: number }>>([])

  function loadCache() {
    try {
      const raw = localStorage.getItem(cacheKey(accountId))
      if (!raw) return
      const parsed = JSON.parse(raw) as any
      if (parsed?.ts && Date.now() - parsed.ts < CACHE_TTL_MS) {
        setWarehouses(parsed.warehouses ?? [])
        setStocksByWarehouse(parsed.stocksByWarehouse ?? {})
        setLastSync(parsed.ts ?? null)
      }
    } catch {
      // ignore cache
    }
  }

  function saveCache(data: { warehouses: any; stocksByWarehouse: any }) {
    try {
      localStorage.setItem(cacheKey(accountId), JSON.stringify({ ...data, ts: Date.now() }))
    } catch {
      // ignore cache
    }
  }

  async function loadData() {
    if (!sellerToken) return
    setLoading(true)
    try {
      const whRaw = await listWarehouses(sellerToken, openApiStrategyId)
      const normalized = whRaw.map(normalizeWarehouse).filter(Boolean) as Array<{ id: number; name: string }>
      setWarehouses(normalized)

      const stocksMap: Record<number, Array<{ skuKey: string; title: string; qty: number }>> = {}
      for (const wh of normalized) {
        const stocks = await listStocksByWarehouse(sellerToken, wh.id, openApiStrategyId)
        stocksMap[wh.id] = stocks.map(normalizeStock).filter(Boolean) as Array<{ skuKey: string; title: string; qty: number }>
      }
      setStocksByWarehouse(stocksMap)
      setLastSync(Date.now())
      saveCache({ warehouses: normalized, stocksByWarehouse: stocksMap })
      push('Данные по остаткам обновлены')
    } catch (e: any) {
      const msg = String(e?.detail ?? e?.message ?? e)
      push(`Ошибка загрузки остатков: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCache()
    if (sellerToken) void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, sellerToken])

  useEffect(() => {
    if (!sellerToken) return
    const t = window.setInterval(() => {
      void loadData()
    }, CACHE_TTL_MS)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerToken, accountId])

  const tableRows = useMemo(() => {
    const allSku = new Map<string, { title: string; perWarehouse: Record<number, number> }>()
    for (const [whIdStr, stocks] of Object.entries(stocksByWarehouse)) {
      const whId = Number(whIdStr)
      for (const s of stocks) {
        const entry = allSku.get(s.skuKey) ?? { title: s.title, perWarehouse: {} }
        entry.perWarehouse[whId] = (entry.perWarehouse[whId] ?? 0) + s.qty
        allSku.set(s.skuKey, entry)
      }
    }
    return Array.from(allSku.entries()).map(([skuKey, info]) => ({
      skuKey,
      title: info.title,
      perWarehouse: info.perWarehouse,
    }))
  }, [stocksByWarehouse])

  useEffect(() => {
    const recs: TransferSuggestion[] = []
    const whIds = warehouses.map((w) => w.id)
    for (const row of tableRows) {
      const amounts = whIds.map((id) => ({ id, qty: row.perWarehouse[id] ?? 0 }))
      const sorted = [...amounts].sort((a, b) => a.qty - b.qty)
      const deficit = sorted[0]
      const surplus = sorted[sorted.length - 1]
      if (!deficit || !surplus) continue
      if (surplus.qty <= 0 || deficit.qty >= surplus.qty) continue
      const moveQty = Math.max(0, Math.floor((surplus.qty - deficit.qty) / 2))
      if (moveQty <= 0) continue
      const fromWh = warehouses.find((w) => w.id === surplus.id)
      const toWh = warehouses.find((w) => w.id === deficit.id)
      if (!fromWh || !toWh) continue
      recs.push({
        skuKey: row.skuKey,
        title: row.title,
        fromWarehouse: fromWh.name,
        toWarehouse: toWh.name,
        qty: moveQty,
        reason: 'баланс дефицита/профицита',
        etaDays: 2 + Math.floor(Math.random() * 4),
      })
    }
    setSuggestions(recs)
    setPlan(
      recs.map((r) => ({
        skuKey: r.skuKey,
        fromWarehouse: r.fromWarehouse,
        toWarehouse: r.toWarehouse,
        qty: r.qty,
      })),
    )
  }, [tableRows, warehouses])

  function enqueueTransfer(suggestion: TransferSuggestion) {
    const id = `${Date.now()}_${suggestion.skuKey}`
    setJobs((prev) => [
      ...prev,
      {
        id,
        skuKey: suggestion.skuKey,
        qty: suggestion.qty,
        fromWarehouse: suggestion.fromWarehouse,
        toWarehouse: suggestion.toWarehouse,
        status: 'queued',
      },
    ])
  }

  useEffect(() => {
    const t = window.setInterval(() => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.status !== 'queued') return job
          return {
            ...job,
            status: 'sent',
            message:
              'Заявка подготовлена. Для отправки нужен модуль автоматизации (см. документацию).',
          }
        }),
      )
    }, 4000)
    return () => window.clearInterval(t)
  }, [])

  async function loginToPortal() {
    if (!login || !password) return
    setLoginStatus('loading')
    try {
      const r = await fetch('/api/stock-transfer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'login_failed')
      setLoginStatus('ok')
      push('Авторизация успешна')
    } catch (e: any) {
      setLoginStatus('error')
      push(`Ошибка входа: ${String(e?.message ?? e)}`)
    }
  }

  async function startManualLogin() {
    setManualStatus('Ожидание входа')
    try {
      const r = await fetch('/api/stock-transfer/manual/start', { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'manual_login_failed')
      setManualSessionId(data.sessionId ?? null)
      setManualStatus('Ожидание входа')
      push('Откройте браузер и завершите вход')
    } catch (e: any) {
      setManualStatus(`Ошибка: ${String(e?.message ?? e)}`)
      push(`Ошибка авторизации: ${String(e?.message ?? e)}`)
    }
  }

  useEffect(() => {
    if (!manualSessionId) return
    const t = window.setInterval(async () => {
      const r = await fetch(`/api/stock-transfer/manual/status?sessionId=${encodeURIComponent(manualSessionId)}`)
      const data = await r.json().catch(() => ({}))
      if (data.status === 'ok') {
        setManualStatus('Авторизация прошла успешно')
        push('Авторизация прошла успешно')
        setManualSessionId(null)
        window.clearInterval(t)
      } else if (data.status === 'error') {
        setManualStatus(`Ошибка: ${data.message || 'manual_login_failed'}`)
        setManualSessionId(null)
        window.clearInterval(t)
      }
    }, 3000)
    return () => window.clearInterval(t)
  }, [manualSessionId, push])

  async function requestSmsCode() {
    if (!phone) return
    const now = Date.now()
    if (smsCooldownUntil && now < smsCooldownUntil) {
      push('Повторный запрос доступен позже')
      return
    }
    setLoginStatus('loading')
    try {
      const r = await fetch('/api/stock-transfer/phone/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const text = await r.text()
      const data = text ? JSON.parse(text) : {}
      if (!r.ok) throw new Error(data?.error || 'phone_start_failed')
      setPhoneSession(data.sessionId)
      setLoginStatus('idle')
      setSmsStatus('SMS-код отправлен')
      setSmsCooldownUntil(Date.now() + 60_000)
      push('Код отправлен')
    } catch (e: any) {
      setLoginStatus('error')
      setSmsStatus(`Ошибка: ${String(e?.message ?? e)}`)
      push(`Ошибка запроса кода: ${String(e?.message ?? e)}`)
    }
  }

  async function confirmSmsCode() {
    if (!phoneSession || !phoneCode) return
    setLoginStatus('loading')
    try {
      const r = await fetch('/api/stock-transfer/phone/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: phoneSession, code: phoneCode }),
      })
      const text = await r.text()
      const data = text ? JSON.parse(text) : {}
      if (!r.ok) throw new Error(data?.error || 'phone_confirm_failed')
      setLoginStatus('ok')
      setSmsStatus('Авторизация прошла успешно')
      push('Авторизация прошла успешно')
    } catch (e: any) {
      setLoginStatus('error')
      setSmsStatus(`Ошибка: ${String(e?.message ?? e)}`)
      push(`Ошибка кода: ${String(e?.message ?? e)}`)
    }
  }

  async function loadStocksFromPortal() {
    try {
      const r = await fetch('/api/stock-transfer/stocks')
      const data = await r.json()
      setLogs(data.logs ?? [])
      if (!r.ok || data.status !== 'ok') throw new Error(data?.message || data?.error || 'stocks_failed')
      push('Отчет по остаткам загружен через портал')
    } catch (e: any) {
      push(`Ошибка отчета: ${String(e?.message ?? e)}`)
    }
  }

  async function executeTransfersFromPortal() {
    try {
      const r = await fetch('/api/stock-transfer/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: plan }),
      })
      const data = await r.json()
      setLogs(data.logs ?? [])
      if (!r.ok || data.status !== 'ok') throw new Error(data?.message || data?.error || 'execute_failed')
      push('Заявки поставлены в очередь')
    } catch (e: any) {
      push(`Ошибка отправки: ${String(e?.message ?? e)}`)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div className="h2">Перемещение остатков</div>
          <div className="small muted">Сбор остатков и автоматические рекомендации по перераспределению.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={loadData} disabled={loading}>
            {loading ? 'Загрузка…' : 'Обновить данные'}
          </button>
          <button className="btn" onClick={loadStocksFromPortal}>
            Обновить через портал
          </button>
        </div>
      </div>

      <div className="small" style={{ marginTop: 6 }}>
        Последнее обновление: {lastSync ? new Date(lastSync).toLocaleString() : '—'}
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <div style={{ fontWeight: 700 }}>Авторизация в Wildberries Seller</div>
        <div className="small muted">Войдите по телефону или логину, чтобы парсить отчет и отправлять заявки.</div>
        <div className="card" style={{ marginTop: 8 }}>
          <div className="small muted">
            Откройте браузер → выполните вход вручную с номером телефона и SMS-кодом → дождитесь подтверждения.
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={startManualLogin}>
              Открыть браузер для входа Wildberries
            </button>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Статус: {manualStatus}
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" placeholder="Номер телефона" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn" onClick={requestSmsCode}>
            Запросить SMS-код
          </button>
          <input className="input" placeholder="Код из SMS" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} />
          <button className="btn primary" onClick={confirmSmsCode}>
            Войти
          </button>
          <button className="btn" onClick={requestSmsCode}>
            Запросить снова
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          {smsStatus}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" placeholder="Логин" value={login} onChange={(e) => setLogin(e.target.value)} />
          <input className="input" placeholder="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn primary" onClick={loginToPortal}>
            Войти
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Статус: {loginStatus === 'loading' ? 'Ожидание' : loginStatus === 'ok' ? 'Авторизация успешна' : loginStatus === 'error' ? 'Ошибка входа' : 'Ожидание'}
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="transfer-table">
        <div className="transfer-row transfer-head">
          <div>SKU</div>
          <div>Название</div>
          {warehouses.map((w) => (
            <div key={w.id}>{w.name}</div>
          ))}
          <div>Предложение</div>
          <div>Действие</div>
        </div>

        {tableRows.map((row) => {
          const suggestion = suggestions.find((s) => s.skuKey === row.skuKey)
          return (
            <div key={row.skuKey} className="transfer-row">
              <div className="mono">{row.skuKey}</div>
              <div>{row.title}</div>
              {warehouses.map((w) => (
                <div key={w.id}>{row.perWarehouse[w.id] ?? 0}</div>
              ))}
              <div className="small">
                {suggestion
                  ? `${suggestion.fromWarehouse} → ${suggestion.toWarehouse}, ${suggestion.qty} шт (${suggestion.reason}, ETA ${suggestion.etaDays}д)`
                  : 'Нет предложения'}
              </div>
              <div>
                {suggestion ? (
                  <button className="btn" onClick={() => enqueueTransfer(suggestion)}>
                    Создать заявку
                  </button>
                ) : (
                  <span className="muted small">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ height: 16 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <strong>План перемещений</strong>
        <div className="small muted">Проверьте и отредактируйте план перед отправкой.</div>
        <div style={{ height: 8 }} />
        <div className="transfer-table">
          <div className="transfer-row transfer-head">
            <div>SKU</div>
            <div>Откуда</div>
            <div>Куда</div>
            <div>Количество</div>
          </div>
          {plan.map((item, idx) => (
            <div key={`${item.skuKey}_${idx}`} className="transfer-row">
              <div className="mono">{item.skuKey}</div>
              <div>{item.fromWarehouse}</div>
              <div>{item.toWarehouse}</div>
              <div>
                <input
                  className="input"
                  type="number"
                  value={item.qty}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    setPlan((prev) => prev.map((p, i) => (i === idx ? { ...p, qty: next } : p)))
                  }}
                />
              </div>
            </div>
          ))}
          {plan.length === 0 && <div className="small muted">План пуст.</div>}
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <strong>Очередь заявок</strong>
        <div className="small muted">Автоматизация формируется в фоне. Для отправки требуется модуль автоматизации.</div>
        <div style={{ height: 8 }} />
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={executeTransfersFromPortal}>
            Отправить через портал
          </button>
        </div>
        <div className="list">
          {jobs.length === 0 && <div className="small muted">Очередь пуста.</div>}
          {jobs.map((job) => (
            <div key={job.id} className="card">
              <div style={{ fontWeight: 700 }}>{job.skuKey}</div>
              <div className="small">
                {job.fromWarehouse} → {job.toWarehouse}, {job.qty} шт · статус: {job.status}
              </div>
              {job.message && <div className="small muted">{job.message}</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <strong>Логи авторизации и действий</strong>
        <div style={{ height: 8 }} />
        <div className="list">
          {logs.length === 0 && <div className="small muted">Логи не найдены.</div>}
          {logs.map((log, idx) => (
            <div key={idx} className="small">
              [{new Date(log.ts).toLocaleString()}] {log.level}: {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
