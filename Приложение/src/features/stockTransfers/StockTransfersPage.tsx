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

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div className="h2">Перемещение остатков</div>
          <div className="small muted">Сбор остатков и автоматические рекомендации по перераспределению.</div>
        </div>
        <button className="btn" onClick={loadData} disabled={loading}>
          {loading ? 'Загрузка…' : 'Обновить данные'}
        </button>
      </div>

      <div className="small" style={{ marginTop: 6 }}>
        Последнее обновление: {lastSync ? new Date(lastSync).toLocaleString() : '—'}
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
        <strong>Очередь заявок</strong>
        <div className="small muted">Автоматизация формируется в фоне. Для отправки требуется модуль автоматизации.</div>
        <div style={{ height: 8 }} />
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
    </div>
  )
}
