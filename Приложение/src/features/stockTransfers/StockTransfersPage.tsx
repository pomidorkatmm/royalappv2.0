import React, { useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'

type PlanRow = {
  skuKey: string
  fromWarehouse: string
  toWarehouse: string
  qty: number
}

type TransferResult = PlanRow & { status: string; message?: string }

export default function StockTransfersPage() {
  const { push } = useToast()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [authStatus, setAuthStatus] = useState('Ожидание входа')
  const [sessionSaved, setSessionSaved] = useState(false)
  const [stocks, setStocks] = useState<string[][]>([])
  const [plan, setPlan] = useState<PlanRow[]>([])
  const [results, setResults] = useState<TransferResult[]>([])
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [loadingExec, setLoadingExec] = useState(false)

  async function captureSession() {
    const webview = webviewRef.current
    if (!webview) return
    try {
      const localStorageData = await webview.executeJavaScript('JSON.stringify({...localStorage})')
      const sessionStorageData = await webview.executeJavaScript('JSON.stringify({...sessionStorage})')
      const cookies = await webview.getWebContents().session.cookies.get({ url: 'https://seller.wildberries.ru' })
      await fetch('/api/stock-transfer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies,
          localStorage: JSON.parse(localStorageData || '{}'),
          sessionStorage: JSON.parse(sessionStorageData || '{}'),
        }),
      })
      setSessionSaved(true)
      setAuthStatus('Авторизация прошла успешно')
      push('Сессия сохранена')
    } catch (e) {
      setAuthStatus(`Ошибка авторизации: ${String(e?.message ?? e)}`)
    }
  }

  function openWebViewLogin() {
    const webview = webviewRef.current
    if (!webview) return
    setAuthStatus('Ожидание входа')
    webview.src = 'https://seller.wildberries.ru/'
  }

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    const handler = async () => {
      const url = webview.getURL()
      if (url && !url.includes('login')) {
        await captureSession()
      }
    }
    webview.addEventListener('did-navigate', handler)
    webview.addEventListener('did-stop-loading', handler)
    return () => {
      webview.removeEventListener('did-navigate', handler)
      webview.removeEventListener('did-stop-loading', handler)
    }
  }, [])

  async function loadStocks() {
    setLoadingStocks(true)
    try {
      const r = await fetch('/api/stock-transfer/stocks')
      const data = await r.json()
      if (data.status !== 'ok') throw new Error(data.message || 'stocks_failed')
      setStocks(data.rows || [])
      push('Остатки загружены')
    } catch (e) {
      push(`Ошибка остатков: ${String(e?.message ?? e)}`)
    } finally {
      setLoadingStocks(false)
    }
  }

  async function executePlan() {
    setLoadingExec(true)
    try {
      const r = await fetch('/api/stock-transfer/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: plan }),
      })
      const data = await r.json()
      if (data.status !== 'ok') throw new Error(data.message || 'execute_failed')
      setResults(data.results || [])
      push('Заявки отправлены')
    } catch (e) {
      push(`Ошибка заявок: ${String(e?.message ?? e)}`)
    } finally {
      setLoadingExec(false)
    }
  }

  function addPlanRow() {
    setPlan((prev) => [...prev, { skuKey: '', fromWarehouse: '', toWarehouse: '', qty: 0 }])
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transfer-results.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    const headers = ['SKU', 'Откуда', 'Куда', 'Количество', 'Статус', 'Сообщение']
    const escapeCell = (value: string | number | undefined) => {
      const text = value == null ? '' : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }
    const rows = results.map((row) => [
      escapeCell(row.skuKey),
      escapeCell(row.fromWarehouse),
      escapeCell(row.toWarehouse),
      escapeCell(row.qty),
      escapeCell(row.status),
      escapeCell(row.message),
    ])
    const csv = [headers.map(escapeCell).join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transfer-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card">
      <div className="h2">Перемещение остатков</div>
      <div className="small muted">Ручной вход через WebView и автоматизация через Playwright.</div>

      <div className="card" style={{ background: '#fafafa', marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>Авторизация Wildberries</div>
        <div className="small muted">
          Откройте браузер → выполните вход вручную по номеру телефона и SMS-коду → дождитесь подтверждения.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={openWebViewLogin}>
            Открыть WebView для входа Wildberries
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Статус: {authStatus}
        </div>
        <div style={{ marginTop: 10 }}>
          <webview ref={webviewRef} className="wb-webview" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={loadStocks} disabled={!sessionSaved || loadingStocks}>
          {loadingStocks ? 'Загрузка…' : 'Загрузить остатки'}
        </button>
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <strong>Остатки</strong>
        <div className="small muted">SKU / склад / остаток (парсинг из отчёта).</div>
        <div style={{ height: 8 }} />
        <div className="transfer-table">
          {stocks.length === 0 && <div className="small muted">Нет данных.</div>}
          {stocks.map((row, idx) => (
            <div key={idx} className="transfer-row">
              {row.map((cell, i) => (
                <div key={i}>{cell}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <strong>План перемещений</strong>
        <div className="small muted">Редактируйте строки перед отправкой.</div>
        <div style={{ height: 8 }} />
        <div className="transfer-table">
          <div className="transfer-row transfer-head">
            <div>SKU</div>
            <div>Откуда</div>
            <div>Куда</div>
            <div>Количество</div>
          </div>
          {plan.map((row, idx) => (
            <div key={idx} className="transfer-row">
              <input className="input" value={row.skuKey} onChange={(e) => setPlan((prev) => prev.map((p, i) => i === idx ? { ...p, skuKey: e.target.value } : p))} />
              <input className="input" value={row.fromWarehouse} onChange={(e) => setPlan((prev) => prev.map((p, i) => i === idx ? { ...p, fromWarehouse: e.target.value } : p))} />
              <input className="input" value={row.toWarehouse} onChange={(e) => setPlan((prev) => prev.map((p, i) => i === idx ? { ...p, toWarehouse: e.target.value } : p))} />
              <input className="input" type="number" value={row.qty} onChange={(e) => setPlan((prev) => prev.map((p, i) => i === idx ? { ...p, qty: Number(e.target.value) } : p))} />
            </div>
          ))}
          {plan.length === 0 && <div className="small muted">План пуст.</div>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={addPlanRow}>Добавить строку</button>
          <button className="btn primary" onClick={executePlan} disabled={loadingExec || plan.length === 0}>
            {loadingExec ? 'Отправка…' : 'Запустить перемещения'}
          </button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ background: '#fafafa' }}>
        <strong>Отчет по результатам</strong>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={exportJson} disabled={results.length === 0}>Экспорт JSON</button>
          <button className="btn" onClick={exportCsv} disabled={results.length === 0}>Экспорт CSV</button>
        </div>
        <div style={{ height: 8 }} />
        <div className="transfer-table">
          {results.length === 0 && <div className="small muted">Пока нет результатов.</div>}
          {results.length > 0 && (
            <div className="transfer-row transfer-head">
              <div>SKU</div>
              <div>Откуда</div>
              <div>Куда</div>
              <div>Количество</div>
              <div>Статус</div>
              <div>Сообщение</div>
            </div>
          )}
          {results.map((res, idx) => (
            <div key={idx} className="transfer-row">
              <div>{res.skuKey}</div>
              <div>{res.fromWarehouse}</div>
              <div>{res.toWarehouse}</div>
              <div>{res.qty}</div>
              <div>{res.status}</div>
              <div className="small muted">{res.message || '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
