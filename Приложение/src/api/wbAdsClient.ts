import { WB_ADS_ENDPOINTS, WB_PROXY_ADS, WB_PROXY_ADS_ALT } from '../config'
import { wbProxyFetch } from './wbProxyFetch'
import { WbHttpError } from './wbClient'

async function withAdsBaseFallback<T>(token: string, fn: (base: string) => Promise<T>): Promise<T> {
  try {
    return await fn(WB_PROXY_ADS)
  } catch (e: any) {
    // у части продавцов встречается домен advert-api.wb.ru
    if (e instanceof WbHttpError && (e.status === 401 || e.status === 404)) {
      return await fn(WB_PROXY_ADS_ALT)
    }
    throw e
  }
}

export type AdsCampaign = any

export type AdsCampaignCountGroup = {
  type?: number
  status?: number
  count?: number
  advert_list?: Array<{ advertId: number; changeTime?: string }>
}

export type AdsCampaignCountResponse = {
  adverts?: AdsCampaignCountGroup[]
  all?: number
}

/** Быстрая проверка валидности токена Promotion (WB Ads). */
export async function validateAdsToken(token: string) {
  // Если запрос успешный — токен валиден (даже если кампаний 0).
  await withAdsBaseFallback(token.trim(), (base) =>
    wbProxyFetch<AdsCampaignCountResponse>(token.trim(), base, WB_ADS_ENDPOINTS.campaignsCount, { authMode: 'auto' }),
  )
}

/**
 * Получить список кампаний (только id) через /adv/v1/promotion/count.
 * Это самый стабильный метод, а детальную инфу подтягиваем вторым запросом.
 */
export async function listAdsCampaignIds(token: string): Promise<number[]> {
  const r = await withAdsBaseFallback(token.trim(), (base) =>
    wbProxyFetch<AdsCampaignCountResponse>(token.trim(), base, WB_ADS_ENDPOINTS.campaignsCount, { authMode: 'auto' }),
  )

  const ids: number[] = []
  for (const g of r?.adverts ?? []) {
    for (const it of g?.advert_list ?? []) {
      const id = Number(it?.advertId)
      if (Number.isFinite(id)) ids.push(id)
    }
  }
  // уникальные
  return Array.from(new Set(ids))
}

/** WB ограничивает ids максимум 50 за запрос */
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Детальная информация о кампаниях по списку ids.
 * Актуальный метод: POST /adv/v1/promotion/adverts
 * body: [id1, id2, ...] (до 50 за запрос)
 */
export async function getAdsCampaignsInfoByIds(
  token: string,
  ids: number[],
  opts: { status?: number; type?: number; order?: 'create' | 'change' | 'id'; direction?: 'asc' | 'desc' } = {},
): Promise<AdsCampaign[]> {
  const safeIds = ids.filter((x) => Number.isFinite(x) && x > 0)
  if (safeIds.length === 0) return []

  const batches = chunk(safeIds, 50)
  const all: AdsCampaign[] = []
  for (const part of batches) {
    const r = await withAdsBaseFallback(token.trim(), (base) =>
      wbProxyFetch<any>(token.trim(), base, WB_ADS_ENDPOINTS.campaignsInfo, {
        method: 'POST',
        // по документации body — массив ID
        body: part,
        // query-параметры опциональны (фильтрация/сортировка), но не обязательны
        query: {
          status: opts.status,
          type: opts.type,
          order: opts.order,
          direction: opts.direction,
        },
        authMode: 'auto',
      }),
    )
    // ответ — массив объектов
    const arr = Array.isArray(r) ? r : Array.isArray(r?.adverts) ? r.adverts : []
    all.push(...arr)
  }
  return all
}

export async function listAdsCampaigns(
  token: string,
  // Оставлено для обратной совместимости: фактически получаем ids через count
  // и подтягиваем инфо вторым запросом.
  opts: { status?: number; type?: number; order?: 'create' | 'change' | 'id'; direction?: 'asc' | 'desc' } = {},
) {
  const ids = await listAdsCampaignIds(token)
  return getAdsCampaignsInfoByIds(token, ids, opts)
}

export type FullStatsNm = {
  nmId?: number
  nm_id?: number
  views?: number
  clicks?: number
  atbs?: number
  orders?: number
}

export async function getAdsFullStats(
  token: string,
  args: { ids: number[]; beginDate: string; endDate: string },
) {
  // По документации: /adv/v3/fullstats
  // params: ids=1,2,3&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  return withAdsBaseFallback(token.trim(), (base) =>
    wbProxyFetch<any>(token.trim(), base, WB_ADS_ENDPOINTS.fullStats, {
      query: {
        ids: args.ids.join(','),
        beginDate: args.beginDate,
        endDate: args.endDate,
      },
      authMode: 'auto',
    }),
  )
}

export function extractNmIdsFromCampaign(c: any): number[] {
  const out = new Set<number>()

  function walk(v: any) {
    if (v == null) return
    if (typeof v === 'number') {
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (typeof v === 'object') {
      // частые ключи
      if (Array.isArray((v as any).nms)) {
        for (const x of (v as any).nms) {
          if (typeof x === 'number') out.add(x)
        }
      }
      if (Array.isArray((v as any).nm_settings)) {
        for (const s of (v as any).nm_settings) {
          const id = (s as any).nm_id
          if (typeof id === 'number') out.add(id)
        }
      }

      for (const val of Object.values(v)) walk(val)
    }
  }

  walk(c)
  return [...out]
}

export function sumStatsForNmId(fullStatsPayload: any, nmId: number) {
  // payload обычно массив кампаний
  const totals = { views: 0, clicks: 0, atbs: 0, orders: 0 }
  const arr = Array.isArray(fullStatsPayload) ? fullStatsPayload : fullStatsPayload?.data ?? []

  const addNm = (nm: any) => {
    const id = nm?.nmId ?? nm?.nm_id ?? nm?.nm
    if (id !== nmId) return
    totals.views += Number(nm?.views ?? 0)
    totals.clicks += Number(nm?.clicks ?? 0)
    totals.atbs += Number(nm?.atbs ?? 0)
    totals.orders += Number(nm?.orders ?? 0)
  }

  const walk = (v: any) => {
    if (v == null) return
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (typeof v === 'object') {
      // в /adv/v3/fullstats: campaign -> days[] -> apps[] -> nms[]
      if (Array.isArray((v as any).nms)) {
        for (const nm of (v as any).nms) addNm(nm)
      }
      for (const val of Object.values(v)) walk(val)
    }
  }

  walk(arr)
  return totals
}
