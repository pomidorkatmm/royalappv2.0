import { STORAGE_KEYS } from '../../config'

export type WbAccount = {
  id: string
  name: string
  sellerToken: string
  adsToken: string
  sellerSid?: number
  openApiStrategyId?: 'A' | 'B' | 'C' | 'D'
  openApiStrategyConfirmedBy?: string
  openApiStrategyCheckedAtMs?: number
  tokenChecks?: {
    // Seller API categories
    access?: Partial<Record<string, 'ok' | 'error' | 'warn'>>
    accessMessages?: Partial<Record<string, string>>
    // Ads API
    adsPromotion?: boolean
    adsMedia?: boolean
    checkedAtMs?: number
  }
}

function safeJson<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export function loadAccounts(): WbAccount[] {
  const raw = localStorage.getItem(STORAGE_KEYS.accounts)
  const arr = safeJson<WbAccount[]>(raw)
  if (!Array.isArray(arr)) return []
  return arr
    .filter((a) => a && typeof a.id === 'string')
    .map((a) => ({
      id: a.id,
      name: String(a.name ?? 'Магазин'),
      sellerToken: String(a.sellerToken ?? ''),
      adsToken: String(a.adsToken ?? ''),
      sellerSid: typeof a.sellerSid === 'number' ? a.sellerSid : undefined,
      openApiStrategyId: a.openApiStrategyId as WbAccount['openApiStrategyId'],
      openApiStrategyConfirmedBy: typeof a.openApiStrategyConfirmedBy === 'string' ? a.openApiStrategyConfirmedBy : undefined,
      openApiStrategyCheckedAtMs: typeof a.openApiStrategyCheckedAtMs === 'number' ? a.openApiStrategyCheckedAtMs : undefined,
      tokenChecks: a.tokenChecks && typeof a.tokenChecks === 'object' ? (a.tokenChecks as any) : undefined,
    }))
}

export function saveAccounts(next: WbAccount[]) {
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(next))
}

export function getActiveAccountId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.activeAccountId)
}

export function setActiveAccountId(id: string) {
  localStorage.setItem(STORAGE_KEYS.activeAccountId, id)
}

export function ensureMigrationFromLegacy(): void {
  const existing = loadAccounts()
  if (existing.length > 0) return

  const legacy = localStorage.getItem(STORAGE_KEYS.apiKeyLegacy) || ''
  const seller = localStorage.getItem(STORAGE_KEYS.sellerApiKey) || legacy
  const ads = localStorage.getItem(STORAGE_KEYS.adsApiKey) || ''
  if (!seller && !ads) return

  const id = `acc_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const acc: WbAccount = { id, name: 'Мой магазин', sellerToken: seller, adsToken: ads }
  saveAccounts([acc])
  setActiveAccountId(id)
}
