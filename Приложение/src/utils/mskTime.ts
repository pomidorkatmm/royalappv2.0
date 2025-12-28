const MSK_TZ = 'Europe/Moscow'

/**
 * Возвращает текущие части времени в МСК (UTC+3) независимо от локальной TZ.
 */
export function getMskParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  })

  // formatToParts поддерживается в Chromium/Electron
  const parts = fmt.formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value

  const hour = Number(map.hour)
  const minute = Number(map.minute)
  const year = Number(map.year)
  const month = Number(map.month)
  const day = Number(map.day)

  const weekdayShort = map.weekday || ''
  // Пн..Вс => 0..6
  const weekdayMap: Record<string, number> = {
    'пн': 0,
    'вт': 1,
    'ср': 2,
    'чт': 3,
    'пт': 4,
    'сб': 5,
    'вс': 6,
  }
  const wd = weekdayMap[String(weekdayShort).toLowerCase().slice(0, 2)] ?? 0

  const ymd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  return { dayIndex: wd, hour, minute, ymd, hm, timeZone: MSK_TZ }
}

export const MSK_TIMEZONE = MSK_TZ
