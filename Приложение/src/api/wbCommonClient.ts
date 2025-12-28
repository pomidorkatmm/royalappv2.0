import { WB_COMMON_ENDPOINTS } from '../config'
import { openApiFetch, type OpenApiStrategyId } from './wbOpenApiClient'

export type SellerInfo = {
  name?: string
  sid?: number
  tradeMark?: string
}

/** Получить название магазина/продавца по токену (General API). */
export async function getSellerInfo(token: string, strategyId?: OpenApiStrategyId): Promise<SellerInfo> {
  return openApiFetch<SellerInfo>(token.trim(), 'common', WB_COMMON_ENDPOINTS.sellerInfo, { method: 'GET' }, strategyId)
}
