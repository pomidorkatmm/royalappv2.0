export type AbTestType = 'photo' | 'price'

export type AbVariant =
  | {
      id: string
      kind: 'photo'
      label: string
      coverUrl: string
    }
  | {
      id: string
      kind: 'price'
      label: string
      price: number
    }

export type AbTotals = {
  views: number
  clicks: number
  atbs: number
  orders: number
}

export type AbVariantMetrics = AbTotals & {
  ctr: number
}

export type AbTest = {
  id: string
  createdAt: string
  name: string
  nmId: number
  vendorCode?: string
  productTitle?: string
  type: AbTestType
  slotMinutes: number
  campaignIds: number[]

  // для фото
  baselinePhotoUrls?: string[]
  allPhotoUrls?: string[]

  // для цены
  baselinePrice?: { price: number; discount: number }

  variants: AbVariant[]
  activeVariantId?: string
  status: 'draft' | 'running' | 'paused' | 'stopped'

  lastTotals?: AbTotals
  metrics: Record<string, AbVariantMetrics>
  history: Array<{
    ts: string
    variantId: string
    delta: AbTotals
    totalsAfter: AbTotals
  }>
}
