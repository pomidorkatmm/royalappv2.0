import React, { useEffect, useMemo, useState } from 'react'
import { WB_PROXY_ADS, WB_PROXY_ADS_ALT } from '../config'
import { ACCESS_SECTIONS, formatAccessError, requestOpenApiRaw, type OpenApiSection, type OpenApiStrategyId } from '../api/wbOpenApiClient'

const HISTORY_LIMIT = 20

type HistoryEntry = {
  command: string
  section: OpenApiSection | 'ads'
}

type ResponseState = {
  command: string
  method: string
  url: string
  status: number
  durationMs: number
  headers: Record<string, string>
  body: any
  usedBase?: string
  authMode?: 'raw' | 'bearer'
  error?: string
} | null

function historyKey(accountId: string) {
  return `wb_dev_console_history_${accountId}`
}

function loadHistory(accountId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(accountId))
    const arr = raw ? (JSON.parse(raw) as HistoryEntry[]) : []
    if (!Array.isArray(arr)) return []
    return arr.filter((h) => h && typeof h.command === 'string')
  } catch {
    return []
  }
}

function saveHistory(accountId: string, entries: HistoryEntry[]) {
  try {
    localStorage.setItem(historyKey(accountId), JSON.stringify(entries.slice(0, HISTORY_LIMIT)))
  } catch {
    // ignore
  }
}

function parseCommand(raw: string): { method: string; path: string; body?: any; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { method: '', path: '', error: 'Введите команду' }
  const match = trimmed.match(/^(\w+)\s+(\S+)(?:\s+([\s\S]+))?$/)
  if (!match) return { method: '', path: '', error: 'Формат: GET /path или POST /path {json}' }
  const method = match[1].toUpperCase()
  const path = match[2]
  const bodyRaw = match[3]
  if (bodyRaw) {
    try {
      const body = JSON.parse(bodyRaw)
      return { method, path, body }
    } catch (e) {
      return { method, path, error: 'Тело запроса должно быть валидным JSON' }
    }
  }
  return { method, path }
}

function splitPath(pathWithQuery: string): { path: string; query: Record<string, string> } {
  const [path, queryStr] = pathWithQuery.split('?')
  const query: Record<string, string> = {}
  if (queryStr) {
    const params = new URLSearchParams(queryStr)
    params.forEach((value, key) => {
      query[key] = value
    })
  }
  return { path, query }
}

function isAdsPath(path: string) {
  return path.startsWith('/adv') || path.startsWith('/ads') || path.includes('/promotion')
}

function explainStatus(status: number): string | undefined {
  if (status === 401 || status === 403) return '401 — не авторизован, проверь токен/права'
  if (status === 404) return '404 — эндпоинт не существует или неверный base path/версия/метод'
  return undefined
}

async function requestAdsRaw(
  token: string,
  path: string,
  opts: { method: string; body?: any; query?: Record<string, string> },
): Promise<{ status: number; headers: Record<string, string>; body: any; durationMs: number; url: string; usedBase: string; authMode: 'raw' | 'bearer' }> {
  const bases = [WB_PROXY_ADS, WB_PROXY_ADS_ALT]
  const authCandidates: Array<{ value: string; mode: 'raw' | 'bearer' }> = [
    { value: token.trim(), mode: 'raw' },
    { value: token.toLowerCase().startsWith('bearer ') ? token.trim() : `Bearer ${token.trim()}`, mode: 'bearer' },
  ]

  for (const base of bases) {
    for (const auth of authCandidates) {
      const url = new URL(base + path)
      if (opts.query) {
        for (const [k, v] of Object.entries(opts.query)) {
          if (v === undefined || v === null || v === '') continue
          url.searchParams.set(k, String(v))
        }
      }

      const headers: Record<string, string> = {
        Authorization: auth.value,
      }
      if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json'
      }

      const started = performance.now()
      const res = await fetch(url.toString(), {
        method: opts.method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      })
      const durationMs = Math.round(performance.now() - started)
      const text = await res.text()
      let body: any = text
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }

      const headersObj: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        headersObj[key] = value
      })

      if (res.status === 404 && base === WB_PROXY_ADS) {
        continue
      }
      if ((res.status === 401 || res.status === 403) && auth.mode === 'raw') {
        continue
      }

      return { status: res.status, headers: headersObj, body, durationMs, url: url.toString(), usedBase: base, authMode: auth.mode }
    }
  }

  throw new Error('WB Ads API: не удалось подобрать рабочий домен/авторизацию')
}

export default function DevConsole({
  accountId,
  sellerToken,
  adsToken,
  strategyId,
  strategyConfirmedBy,
}: {
  accountId: string
  sellerToken: string
  adsToken: string
  strategyId?: OpenApiStrategyId
  strategyConfirmedBy: string
}) {
  const [command, setCommand] = useState('GET /api/v1/feedbacks?isAnswered=false&take=1&skip=0')
  const [section, setSection] = useState<OpenApiSection | 'ads'>('feedbacks')
  const [response, setResponse] = useState<ResponseState>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(accountId))
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setHistory(loadHistory(accountId))
  }, [accountId])

  useEffect(() => {
    saveHistory(accountId, history)
  }, [accountId, history])

  const sectionOptions = useMemo(() => {
    const base = ACCESS_SECTIONS.map((s) => ({ id: s.id, label: s.label }))
    return [...base, { id: 'ads', label: 'WB Ads (Promotion)' }]
  }, [])

  const strategyLine = strategyId
    ? `OpenAPI стратегия: ${strategyId}${strategyConfirmedBy ? ` • ${strategyConfirmedBy}` : ''}`
    : 'OpenAPI стратегия: не выбрана'

  async function send() {
    const parsed = parseCommand(command)
    if (parsed.error) {
      setResponse({
        command,
        method: parsed.method || 'GET',
        url: '',
        status: 0,
        durationMs: 0,
        headers: {},
        body: null,
        error: parsed.error,
      })
      return
    }

    const { path, query } = splitPath(parsed.path)
    const useAds = section === 'ads' || isAdsPath(path)
    const token = useAds ? adsToken.trim() : sellerToken.trim()

    if (!token) {
      setResponse({
        command,
        method: parsed.method,
        url: '',
        status: 0,
        durationMs: 0,
        headers: {},
        body: null,
        error: useAds ? 'Нет Promotion токена для WB Ads API' : 'Нет токена WB OpenAPI',
      })
      return
    }

    setSending(true)
    try {
      let res
      if (useAds) {
        res = await requestAdsRaw(token, path, { method: parsed.method, body: parsed.body, query })
        const statusNote = explainStatus(res.status)
        setResponse({
          command,
          method: parsed.method,
          url: res.url,
          status: res.status,
          durationMs: res.durationMs,
          headers: res.headers,
          body: res.body,
          usedBase: res.usedBase,
          authMode: res.authMode,
          error: statusNote,
        })
      } else {
        const result = await requestOpenApiRaw(token, section as OpenApiSection, path, { method: parsed.method, body: parsed.body, query }, strategyId)
        const statusNote = explainStatus(result.status)
        setResponse({
          command,
          method: parsed.method,
          url: result.url,
          status: result.status,
          durationMs: result.durationMs,
          headers: result.headers,
          body: result.body,
          usedBase: `${result.usedBase}${strategyId ? ` • Strategy ${strategyId}` : ''}`,
          error: statusNote,
        })
      }

      setHistory((prev) => {
        const next = [{ command, section }, ...prev.filter((h) => h.command !== command || h.section !== section)]
        return next.slice(0, HISTORY_LIMIT)
      })
    } catch (e) {
      const info = formatAccessError(e)
      setResponse({
        command,
        method: parsed.method,
        url: '',
        status: info.status ?? 0,
        durationMs: 0,
        headers: {},
        body: null,
        error: info.message,
      })
    } finally {
      setSending(false)
    }
  }

  async function copyResponse() {
    if (!response) return
    const payload = {
      command: response.command,
      url: response.url,
      status: response.status,
      durationMs: response.durationMs,
      headers: response.headers,
      body: response.body,
      error: response.error,
    }
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
  }

  return (
    <div className="card devConsole">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Dev console (root)</div>
          <div className="small muted" style={{ marginTop: 4 }}>{strategyLine}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setResponse(null)}>
            Очистить
          </button>
          <button className="btn" onClick={copyResponse} disabled={!response}>
            Скопировать ответ
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="select" value={section} onChange={(e) => setSection(e.target.value as OpenApiSection | 'ads')}>
          {sectionOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ flex: 1, minWidth: 240 }}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="GET /api/v1/supplier/orders?dateFrom=..."
        />
        <button className="btn primary" onClick={() => void send()} disabled={sending}>
          {sending ? '...' : 'Отправить'}
        </button>
      </div>

      {response && (
        <div className="devConsoleResponse" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className={response.status >= 200 && response.status < 300 ? 'badge ok' : 'badge'}>
              {response.status || 'ERR'}
            </span>
            <span className="small muted">{response.durationMs} мс</span>
            {response.usedBase && <span className="small muted">{response.usedBase}</span>}
            {response.authMode && <span className="small muted">Auth: {response.authMode}</span>}
          </div>
          {response.url && (
            <div className="small" style={{ marginTop: 6 }}>
              {response.url}
            </div>
          )}
          {response.error && (
            <div className="small" style={{ marginTop: 6, color: '#b00020' }}>
              {response.error}
            </div>
          )}
          <div className="devConsoleGrid">
            <div>
              <div className="small muted">Headers</div>
              <pre>{JSON.stringify(response.headers, null, 2)}</pre>
            </div>
            <div>
              <div className="small muted">Body</div>
              <pre>{typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="devConsoleHistory" style={{ marginTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>История команд</div>
          <div className="list">
            {history.map((entry, idx) => (
              <button
                key={`${entry.command}-${idx}`}
                className="devConsoleHistoryItem"
                onClick={() => {
                  setCommand(entry.command)
                  setSection(entry.section)
                }}
              >
                <span className="muted">{entry.section === 'ads' ? 'Ads' : entry.section}</span>
                <span>{entry.command}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
