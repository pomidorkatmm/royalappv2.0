import {
  WB_PROXY_BASE,
  WB_PROXY_BASE_ALT,
  WB_PROXY_COMMON,
  WB_PROXY_COMMON_ALT,
  WB_PROXY_CONTENT,
  WB_PROXY_CONTENT_ALT,
  WB_PROXY_PRICES,
  WB_PROXY_PRICES_ALT,
  WB_PROXY_MARKETPLACE,
  WB_PROXY_MARKETPLACE_ALT,
  WB_PROXY_STATISTICS,
  WB_PROXY_STATISTICS_ALT,
  WB_PROXY_FINANCE,
  WB_PROXY_FINANCE_ALT,
  WB_PROXY_ANALYTICS,
  WB_PROXY_ANALYTICS_ALT,
  WB_PROXY_PROMOTION,
  WB_PROXY_PROMOTION_ALT,
  WB_PROXY_CHAT,
  WB_PROXY_CHAT_ALT,
  WB_PROXY_SUPPLIES,
  WB_PROXY_SUPPLIES_ALT,
  WB_PROXY_RETURNS,
  WB_PROXY_RETURNS_ALT,
  WB_PROXY_DOCUMENTS,
  WB_PROXY_DOCUMENTS_ALT,
  WB_PROXY_SUPPLIERS,
  WB_PROXY_SUPPLIERS_ALT,
} from '../config'
import { WbHttpError } from './wbClient'
import { wbProxyFetch } from './wbProxyFetch'

export type OpenApiSection =
  | 'feedbacks'
  | 'content'
  | 'prices'
  | 'common'
  | 'marketplace'
  | 'statistics'
  | 'finance'
  | 'analytics'
  | 'promotion'
  | 'chat'
  | 'supplies'
  | 'returns'
  | 'documents'

export type OpenApiStrategyId = 'A' | 'B' | 'C' | 'D'

export type OpenApiStrategy = {
  id: OpenApiStrategyId
  label: string
  baseVariant: 'primary' | 'alt'
  authMode: 'raw' | 'bearer'
  description: string
}

export type OpenApiStrategyResult = {
  strategyId: OpenApiStrategyId
  confirmedBy: string
  confirmedSection: OpenApiSection
  checkedAtMs: number
}

const OPENAPI_STRATEGIES: OpenApiStrategy[] = [
  {
    id: 'A',
    label: 'Strategy A',
    baseVariant: 'primary',
    authMode: 'raw',
    description: 'Стандартный endpoint + стандартные заголовки',
  },
  {
    id: 'B',
    label: 'Strategy B',
    baseVariant: 'alt',
    authMode: 'raw',
    description: 'Альтернативный домен + стандартные заголовки',
  },
  {
    id: 'C',
    label: 'Strategy C',
    baseVariant: 'primary',
    authMode: 'bearer',
    description: 'Стандартный endpoint + Bearer токен',
  },
  {
    id: 'D',
    label: 'Strategy D',
    baseVariant: 'alt',
    authMode: 'bearer',
    description: 'Альтернативный домен + Bearer токен',
  },
]

const OPENAPI_BASES: Record<OpenApiSection, { primary: string; alt: string }> = {
  feedbacks: { primary: WB_PROXY_BASE, alt: WB_PROXY_BASE_ALT },
  content: { primary: WB_PROXY_CONTENT, alt: WB_PROXY_CONTENT_ALT },
  prices: { primary: WB_PROXY_PRICES, alt: WB_PROXY_PRICES_ALT },
  common: { primary: WB_PROXY_COMMON, alt: WB_PROXY_COMMON_ALT },
  marketplace: { primary: WB_PROXY_MARKETPLACE, alt: WB_PROXY_MARKETPLACE_ALT },
  statistics: { primary: WB_PROXY_STATISTICS, alt: WB_PROXY_STATISTICS_ALT },
  finance: { primary: WB_PROXY_FINANCE, alt: WB_PROXY_FINANCE_ALT },
  analytics: { primary: WB_PROXY_ANALYTICS, alt: WB_PROXY_ANALYTICS_ALT },
  promotion: { primary: WB_PROXY_PROMOTION, alt: WB_PROXY_PROMOTION_ALT },
  chat: { primary: WB_PROXY_CHAT, alt: WB_PROXY_CHAT_ALT },
  supplies: { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  returns: { primary: WB_PROXY_RETURNS, alt: WB_PROXY_RETURNS_ALT },
  documents: { primary: WB_PROXY_DOCUMENTS, alt: WB_PROXY_DOCUMENTS_ALT },
}

const OPENAPI_BASE_FALLBACKS: Partial<Record<OpenApiSection, Array<{ primary: string; alt: string }>>> = {
  marketplace: [
    { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  ],
  statistics: [
    { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  ],
  finance: [
    { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  ],
  analytics: [
    { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  ],
  supplies: [
    { primary: WB_PROXY_SUPPLIES, alt: WB_PROXY_SUPPLIES_ALT },
  ],
  returns: [
    { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  ],
  documents: [
    { primary: WB_PROXY_SUPPLIERS, alt: WB_PROXY_SUPPLIERS_ALT },
  ],
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) return `/${path}`
  return path
}

export function getOpenApiStrategy(id?: OpenApiStrategyId): OpenApiStrategy {
  return OPENAPI_STRATEGIES.find((s) => s.id === id) ?? OPENAPI_STRATEGIES[0]
}

export function listOpenApiStrategies(): OpenApiStrategy[] {
  return [...OPENAPI_STRATEGIES]
}

export function resolveOpenApiBase(section: OpenApiSection, strategyId?: OpenApiStrategyId): string {
  const strategy = getOpenApiStrategy(strategyId)
  const base = OPENAPI_BASES[section]
  return strategy.baseVariant === 'alt' ? base.alt : base.primary
}

function resolveOpenApiBaseCandidates(section: OpenApiSection, strategyId?: OpenApiStrategyId): string[] {
  const strategy = getOpenApiStrategy(strategyId)
  const main = OPENAPI_BASES[section]
  const candidates: string[] = []
  const pickBase = (entry: { primary: string; alt: string }) => (strategy.baseVariant === 'alt' ? entry.alt : entry.primary)

  candidates.push(pickBase(main))
  const fallbacks = OPENAPI_BASE_FALLBACKS[section] ?? []
  for (const fallback of fallbacks) {
    const candidate = pickBase(fallback)
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }
  return candidates
}

export async function openApiFetch<T>(
  token: string,
  section: OpenApiSection,
  path: string,
  opts: {
    method?: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: any
    formData?: FormData
    headers?: Record<string, string>
  } = {},
  strategyId?: OpenApiStrategyId,
): Promise<T> {
  const strategy = getOpenApiStrategy(strategyId)
  const bases = resolveOpenApiBaseCandidates(section, strategy.id)
  let lastError: unknown
  for (const base of bases) {
    try {
      return await wbProxyFetch<T>(token, base, normalizePath(path), {
        method: opts.method,
        query: opts.query,
        body: opts.body,
        formData: opts.formData,
        headers: opts.headers,
        authMode: strategy.authMode,
      })
    } catch (e: any) {
      lastError = e
      const status = Number(e?.status)
      if (status === 0 || status === 404) {
        continue
      }
      throw e
    }
  }
  throw lastError
}

export function formatAccessError(e: unknown): { status?: number; message: string } {
  if (e instanceof WbHttpError) {
    if (e.status === 401 || e.status === 403) {
      return { status: e.status, message: '401 — не авторизован, проверь токен/права' }
    }
    if (e.status === 404) {
      return { status: e.status, message: '404 — эндпоинт не существует или неверный base path/версия/метод' }
    }
    return { status: e.status, message: e.detail ? `${e.status}: ${e.detail}` : `${e.status}: ${e.message}` }
  }
  return { message: String((e as any)?.message ?? e) }
}

function fmtDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function recentDateFrom(daysBack = 7): string {
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  return fmtDateISO(from)
}

function recentUnixSeconds(daysBack = 7): number {
  return Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000)
}

function recentIsoStart(daysBack = 7): string {
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  return from.toISOString()
}

function recentIsoEnd(): string {
  return new Date().toISOString()
}

const PROBE_METHODS: Array<{ section: OpenApiSection; label: string; path: string; method?: string; query?: Record<string, any> }> = [
  { section: 'feedbacks', label: 'Вопросы и отзывы', path: '/api/v1/feedbacks', query: { isAnswered: false, take: 1, skip: 0, order: 'dateDesc' } },
  { section: 'content', label: 'Контент', path: '/content/v2/cards/limits' },
  { section: 'prices', label: 'Цены и скидки', path: '/api/v2/list/goods/filter', query: { limit: 1 } },
  { section: 'common', label: 'Общие', path: '/api/v1/seller-info' },
]

export async function detectOpenApiStrategy(token: string): Promise<OpenApiStrategyResult> {
  for (const strategy of OPENAPI_STRATEGIES) {
    for (const probe of PROBE_METHODS) {
      try {
        await openApiFetch(token, probe.section, probe.path, { method: probe.method ?? 'GET', query: probe.query }, strategy.id)
        const result: OpenApiStrategyResult = {
          strategyId: strategy.id,
          confirmedBy: `${probe.label}: ${probe.path}`,
          confirmedSection: probe.section,
          checkedAtMs: Date.now(),
        }
        return result
      } catch (e) {
        // пробуем дальше
      }
    }
  }
  throw new WbHttpError(401, 'OpenAPI', 'Не удалось подобрать рабочую стратегию (токен/доступ)')
}

export const ACCESS_SECTIONS: Array<{
  id: OpenApiSection
  label: string
  probes: Array<{
    path: string
    method?: string
    query?: Record<string, string | number>
  }>
}> = [
  { id: 'content', label: 'Контент', probes: [{ path: '/content/v2/cards/limits' }] },
  {
    id: 'marketplace',
    label: 'Маркетплейс',
    probes: [
      { path: '/api/v3/orders', query: { limit: 1 } },
      { path: '/api/v2/orders', query: { date_start: recentIsoStart(7), date_end: recentIsoEnd(), take: 1, skip: 0 } },
    ],
  },
  {
    id: 'statistics',
    label: 'Статистика',
    probes: [
      { path: '/api/v1/supplier/orders', query: { dateFrom: recentDateFrom(7) } },
      { path: '/api/v1/supplier/orders', query: { dateFrom: recentUnixSeconds(7) } },
    ],
  },
  {
    id: 'finance',
    label: 'Финансы',
    probes: [
      { path: '/api/v1/supplier/incomes', query: { dateFrom: recentDateFrom(7) } },
      { path: '/api/v1/supplier/incomes', query: { dateFrom: recentUnixSeconds(7) } },
    ],
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    probes: [
      { path: '/api/v1/analytics/stocks', query: { dateFrom: recentDateFrom(7) } },
      { path: '/api/v1/analytics/stocks', query: { dateFrom: recentUnixSeconds(7) } },
    ],
  },
  { id: 'promotion', label: 'Продвижение', probes: [{ path: '/api/v1/promotion/campaigns', query: { limit: 1 } }] },
  {
    id: 'feedbacks',
    label: 'Вопросы и отзывы',
    probes: [{ path: '/api/v1/feedbacks', query: { isAnswered: false, take: 1, skip: 0, order: 'dateDesc' } }],
  },
  { id: 'prices', label: 'Цены и скидки', probes: [{ path: '/api/v2/list/goods/filter', query: { limit: 1 } }] },
  { id: 'chat', label: 'Чат с покупателем', probes: [{ path: '/api/v1/chats', query: { limit: 1 } }] },
  {
    id: 'supplies',
    label: 'Поставки',
    probes: [
      { path: '/api/v2/supplies', query: { status: 'ACTIVE' } },
      { path: '/api/v2/warehouses' },
    ],
  },
  { id: 'returns', label: 'Возвраты', probes: [{ path: '/api/v1/returns', query: { limit: 1 } }] },
  { id: 'documents', label: 'Документы', probes: [{ path: '/api/v1/documents', query: { limit: 1 } }] },
]

export async function requestOpenApiRaw(
  token: string,
  section: OpenApiSection,
  path: string,
  opts: {
    method?: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: any
    headers?: Record<string, string>
  } = {},
  strategyId?: OpenApiStrategyId,
): Promise<{ status: number; headers: Record<string, string>; body: any; durationMs: number; url: string; usedBase: string }> {
  const strategy = getOpenApiStrategy(strategyId)
  const bases = resolveOpenApiBaseCandidates(section, strategy.id)
  const cleanPath = normalizePath(path)
  let lastError: unknown = new Error('Запрос не выполнен')

  for (const base of bases) {
    const url = new URL(base + cleanPath)
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null || v === '') continue
        url.searchParams.set(k, String(v))
      }
    }

    const headers: Record<string, string> = {
      Authorization: strategy.authMode === 'bearer' ? `Bearer ${token.trim()}` : token.trim(),
      ...(opts.headers ?? {}),
    }

    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    try {
      const started = performance.now()
      const res = await fetch(url.toString(), {
        method: opts.method ?? 'GET',
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

      return {
        status: res.status,
        headers: headersObj,
        body,
        durationMs,
        url: url.toString(),
        usedBase: base,
      }
    } catch (e) {
      lastError = e
    }
  }

  throw lastError
}
