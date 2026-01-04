import { openApiFetch, type OpenApiStrategyId } from './wbOpenApiClient'

export type WarehouseDto = {
  id?: number
  warehouseId?: number
  name?: string
  officeName?: string
}

export type StockDto = {
  nmId?: number
  sku?: string
  barcode?: string
  quantity?: number
  amount?: number
  stock?: number
  warehouseId?: number
  warehouseName?: string
  subject?: string
  title?: string
  itemName?: string
}

export async function listWarehouses(token: string, strategyId?: OpenApiStrategyId): Promise<WarehouseDto[]> {
  const r = await openApiFetch<any>(token.trim(), 'marketplace', '/api/v3/warehouses', { method: 'GET' }, strategyId)
  if (Array.isArray(r)) return r
  if (Array.isArray(r?.warehouses)) return r.warehouses
  return []
}

export async function listStocksByWarehouse(token: string, warehouseId: number, strategyId?: OpenApiStrategyId): Promise<StockDto[]> {
  const r = await openApiFetch<any>(
    token.trim(),
    'marketplace',
    `/api/v3/stocks/${warehouseId}`,
    { method: 'GET' },
    strategyId,
  )
  if (Array.isArray(r)) return r
  if (Array.isArray(r?.stocks)) return r.stocks
  return []
}
