import { STORAGE_KEYS } from '../../config'

export type AdsSchedule = {
  [day: number]: {
    [hour: number]: boolean
  }
}

export type AdsSchedulesByCampaign = {
  [campaignId: string]: AdsSchedule
}

export type AdsSchedulesByAccount = {
  [accountId: string]: AdsSchedulesByCampaign
}

function defaultSchedule(): AdsSchedule {
  const out: AdsSchedule = {}
  for (let d = 0; d < 7; d++) {
    out[d] = {}
    for (let h = 0; h < 24; h++) out[d][h] = false
  }
  return out
}

export function readAllSchedules(): AdsSchedulesByAccount {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.adsSchedules)
    if (!raw) return {}
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return {}
    return p as AdsSchedulesByAccount
  } catch {
    return {}
  }
}

export function writeAllSchedules(v: AdsSchedulesByAccount) {
  localStorage.setItem(STORAGE_KEYS.adsSchedules, JSON.stringify(v))
}

export function getSchedule(accountId: string, campaignId: number | string): AdsSchedule {
  const all = readAllSchedules()
  const a = all[accountId] ?? {}
  const c = a[String(campaignId)]
  if (!c) return defaultSchedule()
  // нормализуем
  const norm = defaultSchedule()
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      norm[d][h] = !!(c as any)?.[d]?.[h]
    }
  }
  return norm
}

export function setSchedule(accountId: string, campaignId: number | string, schedule: AdsSchedule) {
  const all = readAllSchedules()
  if (!all[accountId]) all[accountId] = {}
  all[accountId][String(campaignId)] = schedule
  writeAllSchedules(all)
}

export function clearSchedule(accountId: string, campaignId: number | string) {
  const all = readAllSchedules()
  if (!all[accountId]) return
  delete all[accountId][String(campaignId)]
  writeAllSchedules(all)
}

export function copyDay(schedule: AdsSchedule, fromDay: number, toDay: number) {
  const next: AdsSchedule = { ...schedule }
  next[toDay] = { ...schedule[fromDay] }
  return next
}

export function setDayAll(schedule: AdsSchedule, day: number, value: boolean) {
  const next: AdsSchedule = { ...schedule }
  const row: Record<number, boolean> = {}
  for (let h = 0; h < 24; h++) row[h] = value
  next[day] = row
  return next
}

export function toggleCell(schedule: AdsSchedule, day: number, hour: number, value?: boolean) {
  const next: AdsSchedule = { ...schedule, [day]: { ...schedule[day] } }
  next[day][hour] = value ?? !next[day][hour]
  return next
}
