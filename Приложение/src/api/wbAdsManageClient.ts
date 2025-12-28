import {
  WB_ADS_ENDPOINTS,
  WB_ADS_MEDIA_ENDPOINTS,
  WB_PROXY_ADS,
  WB_PROXY_ADS_ALT,
  WB_PROXY_ADS_MEDIA,
  WB_PROXY_ADS_MEDIA_ALT,
} from '../config'
import { wbProxyFetch } from './wbProxyFetch'
import { WbHttpError } from './wbClient'

async function withAdsBaseFallback<T>(token: string, fn: (base: string) => Promise<T>): Promise<T> {
  try {
    return await fn(WB_PROXY_ADS)
  } catch (e: any) {
    if (e instanceof WbHttpError && (e.status === 401 || e.status === 404)) {
      return await fn(WB_PROXY_ADS_ALT)
    }
    throw e
  }
}

async function withMediaBaseFallback<T>(token: string, fn: (base: string) => Promise<T>): Promise<T> {
  try {
    return await fn(WB_PROXY_ADS_MEDIA)
  } catch (e: any) {
    if (e instanceof WbHttpError && (e.status === 401 || e.status === 404)) {
      return await fn(WB_PROXY_ADS_MEDIA_ALT)
    }
    throw e
  }
}

export type UnifiedAdCampaign = {
  id: number
  name: string
  kind: 'promotion' | 'media'
  status?: number
  type?: number
  paymentType?: string
  raw?: any
}

/** Запустить рекламную кампанию (Promotion). */
export async function startPromotionCampaign(token: string, id: number) {
  return withAdsBaseFallback(token.trim(), (base) =>
    wbProxyFetch<void>(token.trim(), base, WB_ADS_ENDPOINTS.campaignStart, {
    method: 'GET',
    query: { id },
    authMode: 'auto',
    }),
  )
}

/** Приостановить рекламную кампанию (Promotion). */
export async function pausePromotionCampaign(token: string, id: number) {
  return withAdsBaseFallback(token.trim(), (base) =>
    wbProxyFetch<void>(token.trim(), base, WB_ADS_ENDPOINTS.campaignPause, {
    method: 'GET',
    query: { id },
    authMode: 'auto',
    }),
  )
}

/** Остановить рекламную кампанию (Promotion). Обычно не нужно для календаря, но оставляем. */
export async function stopPromotionCampaign(token: string, id: number) {
  return withAdsBaseFallback(token.trim(), (base) =>
    wbProxyFetch<void>(token.trim(), base, WB_ADS_ENDPOINTS.campaignStop, {
    method: 'GET',
    query: { id },
    authMode: 'auto',
    }),
  )
}

// ---- Media campaigns ----

export type MediaCampaignListItem = {
  advertId?: number
  advertName?: string
  status?: number
  type?: number
  paymentType?: string
  [k: string]: any
}

export type MediaCampaignListResponse = {
  adverts?: MediaCampaignListItem[]
  total?: number
  [k: string]: any
}

export async function listMediaCampaigns(
  token: string,
  args: { limit?: number; offset?: number; order?: string; direction?: string } = {},
) {
  // docs: /adv/v1/adverts on advert-media-api.wildberries.ru
  return withMediaBaseFallback(token.trim(), (base) =>
    wbProxyFetch<MediaCampaignListResponse>(token.trim(), base, WB_ADS_MEDIA_ENDPOINTS.list, {
      method: 'GET',
      query: {
        limit: args.limit ?? 200,
        offset: args.offset ?? 0,
        order: args.order ?? 'create',
        direction: args.direction ?? 'desc',
      },
      authMode: 'auto',
    }),
  )
}

export type MediaCampaignCountResponse = {
  all?: number
  [k: string]: any
}

export async function getMediaCampaignCount(token: string) {
  return withMediaBaseFallback(token.trim(), (base) =>
    wbProxyFetch<MediaCampaignCountResponse>(token.trim(), base, WB_ADS_MEDIA_ENDPOINTS.count, {
      method: 'GET',
      authMode: 'auto',
    }),
  )
}
