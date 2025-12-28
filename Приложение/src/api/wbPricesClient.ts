import { WB_PRICES_ENDPOINTS } from '../config'
import { openApiFetch, type OpenApiStrategyId } from './wbOpenApiClient'

export async function getCurrentPrice(token: string, nmId: number, strategyId?: OpenApiStrategyId) {
  // GET /api/v2/list/goods/filter?limit=1&offset=0&filterNmID=<nmId>
  const r = await openApiFetch<any>(
    token.trim(),
    'prices',
    WB_PRICES_ENDPOINTS.listGoodsFilter,
    { query: { limit: 1, offset: 0, filterNmID: nmId } },
    strategyId,
  )

  const goods = r?.data?.listGoods?.[0]
  const size = goods?.sizes?.[0]
  return {
    price: Number(size?.price ?? 0),
    discount: Number(goods?.discount ?? 0),
    currency: goods?.currencyIsoCode4217,
    raw: r,
  }
}

export async function setPriceAndDiscount(
  token: string,
  args: { nmId: number; price: number; discount: number },
  strategyId?: OpenApiStrategyId,
) {
  // POST /api/v2/upload/task
  return openApiFetch<any>(
    token.trim(),
    'prices',
    WB_PRICES_ENDPOINTS.uploadTask,
    {
      method: 'POST',
      body: {
        data: [{ nmID: args.nmId, price: Math.round(args.price), discount: Math.round(args.discount) }],
      },
    },
    strategyId,
  )
}

/** Лёгкая проверка доступа к Prices&Discounts API (категория Prices/Discounts). */
export async function checkPricesAccess(token: string, strategyId?: OpenApiStrategyId): Promise<boolean> {
  await openApiFetch<any>(token.trim(), 'prices', WB_PRICES_ENDPOINTS.listGoodsFilter, { query: { limit: 1, offset: 0 } }, strategyId)
  return true
}
