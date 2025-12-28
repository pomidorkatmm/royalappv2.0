import type { AbTest, AbTotals, AbVariant } from './types'
import { getAdsFullStats, sumStatsForNmId } from '../api/wbAdsClient'
import { reorderUrlsKeepAll, saveMediaOrder } from '../api/wbContentClient'
import { setPriceAndDiscount } from '../api/wbPricesClient'
import type { OpenApiStrategyId } from '../api/wbOpenApiClient'

export function ctr(clicks: number, views: number) {
  if (!views) return 0
  return Math.round((clicks / views) * 10000) / 100
}

export async function fetchTotalsFromAds(
  token: string,
  campaignIds: number[],
  nmId: number,
): Promise<AbTotals> {
  const today = new Date()
  const beginDate = today.toISOString().slice(0, 10)
  const endDate = beginDate

  const payload = await getAdsFullStats(token, {
    ids: campaignIds,
    beginDate,
    endDate,
  })

  const t = sumStatsForNmId(payload, nmId)
  return {
    views: t.views,
    clicks: t.clicks,
    atbs: t.atbs,
    orders: t.orders,
  }
}

export function diffTotals(next: AbTotals, prev: AbTotals): AbTotals {
  return {
    views: Math.max(0, next.views - prev.views),
    clicks: Math.max(0, next.clicks - prev.clicks),
    atbs: Math.max(0, next.atbs - prev.atbs),
    orders: Math.max(0, next.orders - prev.orders),
  }
}

export async function applyVariant(token: string, test: AbTest, variant: AbVariant, strategyId?: OpenApiStrategyId) {
  if (variant.kind === 'photo') {
    const all = test.allPhotoUrls ?? test.baselinePhotoUrls ?? []
    const ordered = reorderUrlsKeepAll(all, variant.coverUrl)
    await saveMediaOrder(token, { nmId: test.nmId, urls: ordered }, strategyId)
    return
  }

  if (variant.kind === 'price') {
    const baseDiscount = test.baselinePrice?.discount ?? 0
    await setPriceAndDiscount(token, { nmId: test.nmId, price: variant.price, discount: baseDiscount }, strategyId)
  }
}

export async function restoreBaseline(token: string, test: AbTest, strategyId?: OpenApiStrategyId) {
  if (test.type === 'photo' && test.baselinePhotoUrls?.length) {
    await saveMediaOrder(token, { nmId: test.nmId, urls: test.baselinePhotoUrls }, strategyId)
  }

  if (test.type === 'price' && test.baselinePrice) {
    await setPriceAndDiscount(token, {
      nmId: test.nmId,
      price: test.baselinePrice.price,
      discount: test.baselinePrice.discount,
    }, strategyId)
  }
}
