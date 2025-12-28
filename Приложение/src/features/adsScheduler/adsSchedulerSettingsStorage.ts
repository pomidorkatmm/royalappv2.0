import { STORAGE_KEYS } from '../../config'

export type SchedulerOverride = {
  mode: 'on' | 'off'
  untilMs: number // epoch ms
}

export type CampaignSchedulerSettings = {
  enabled: boolean
  override?: SchedulerOverride
}

type SettingsByCampaign = Record<string, CampaignSchedulerSettings>
type SettingsByAccount = Record<string, SettingsByCampaign>

const KEY = `${STORAGE_KEYS.adsSchedules}_settings` // отдельный неймспейс

export function readAllSchedulerSettings(): SettingsByAccount {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return {}
    return p as SettingsByAccount
  } catch {
    return {}
  }
}

export function writeAllSchedulerSettings(v: SettingsByAccount) {
  localStorage.setItem(KEY, JSON.stringify(v))
}

export function getCampaignSchedulerSettings(accountId: string, campaignId: number | string): CampaignSchedulerSettings {
  const all = readAllSchedulerSettings()
  const s = all[accountId]?.[String(campaignId)]
  return {
    enabled: !!s?.enabled,
    override: s?.override,
  }
}

export function setCampaignSchedulerSettings(accountId: string, campaignId: number | string, next: CampaignSchedulerSettings) {
  const all = readAllSchedulerSettings()
  if (!all[accountId]) all[accountId] = {}
  all[accountId][String(campaignId)] = next
  writeAllSchedulerSettings(all)
}

export function clearExpiredOverrides(accountId: string) {
  const all = readAllSchedulerSettings()
  const now = Date.now()
  const byCamp = all[accountId]
  if (!byCamp) return
  let changed = false
  for (const [, s] of Object.entries(byCamp)) {
    if (s?.override && s.override.untilMs <= now) {
      delete s.override
      changed = true
    }
  }
  if (changed) writeAllSchedulerSettings(all)
}
