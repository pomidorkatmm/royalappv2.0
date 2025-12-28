import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getAdsCampaignsInfoByIds, listAdsCampaignIds } from '../../api/wbAdsClient'
import { getMediaCampaignCount, listMediaCampaigns, pausePromotionCampaign, startPromotionCampaign, type UnifiedAdCampaign } from '../../api/wbAdsManageClient'
import { DEFAULTS } from '../../config'
import { useToast } from '../../components/Toast'
import AdsCalendar from './AdsCalendar'
import { getSchedule, setSchedule, type AdsSchedule, setDayAll, copyDay } from './adsScheduleStorage'
import { clearExpiredOverrides, getCampaignSchedulerSettings, setCampaignSchedulerSettings } from './adsSchedulerSettingsStorage'
import { getMskParts } from '../../utils/mskTime'
import { RequestQueue, retryable } from '../../utils/requestQueue'

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function campaignNameFromPromotionRaw(raw: any): string {
  const nm = raw?.name ?? raw?.settings?.name ?? raw?.campaignName
  return String(nm || `Кампания #${raw?.advertId ?? raw?.id}`)
}

function normalizePromotion(raw: any): UnifiedAdCampaign {
  const id = Number(raw?.advertId ?? raw?.id)
  return {
    id,
    name: campaignNameFromPromotionRaw(raw),
    kind: 'promotion',
    status: Number(raw?.status),
    type: Number(raw?.type),
    paymentType: raw?.paymentType,
    raw,
  }
}

function normalizeMedia(raw: any): UnifiedAdCampaign {
  const id = Number(raw?.advertId ?? raw?.id)
  return {
    id,
    name: String(raw?.advertName ?? raw?.name ?? `Медиа #${id}`),
    kind: 'media',
    status: Number(raw?.status),
    type: Number(raw?.type),
    paymentType: raw?.paymentType,
    raw,
  }
}

function hasAnyOn(schedule: AdsSchedule) {
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (schedule?.[d]?.[h]) return true
  return false
}

export default function AdsSchedulerPage({
  accountId,
  adsToken,
}: {
  accountId: string
  adsToken: string
}) {
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [campaigns, setCampaigns] = useState<UnifiedAdCampaign[]>([])
  const [filter, setFilter] = useState<'all' | 'running' | 'paused'>('all')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [scheduleState, setScheduleState] = useState<AdsSchedule | null>(null)
  const [copyToDay, setCopyToDay] = useState<number>(1)

  const statusRef = useRef<Record<number, number | undefined>>({})
  const unsupportedRef = useRef<Set<number>>(new Set())
  const queueRef = useRef<RequestQueue | null>(null)
  if (!queueRef.current) queueRef.current = new RequestQueue(DEFAULTS.adsQueueDelayMs)

  async function loadCampaigns() {
    if (!adsToken) return
    setLoading(true)
    try {
      // Promotion
      const ids = await listAdsCampaignIds(adsToken)
      const promo = await getAdsCampaignsInfoByIds(adsToken, ids)
      const promoNorm = promo
        .map(normalizePromotion)
        .filter((c) => Number.isFinite(c.id) && c.id > 0)

      // Media
      let mediaItems: any[] = []
      try {
        const cnt = await getMediaCampaignCount(adsToken)
        const total = Math.min(Number(cnt?.all ?? 0) || 0, 2000)
        const pageSize = 200
        for (let offset = 0; offset < total; offset += pageSize) {
          const page = await listMediaCampaigns(adsToken, { limit: pageSize, offset })
          const arr = Array.isArray(page) ? page : Array.isArray(page?.adverts) ? page.adverts : []
          mediaItems.push(...arr)
          if (arr.length < pageSize) break
        }
      } catch {
        // media api optional
      }
      const mediaNorm = mediaItems
        .map(normalizeMedia)
        .filter((c) => Number.isFinite(c.id) && c.id > 0)

      const all = [...promoNorm, ...mediaNorm]
      all.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      setCampaigns(all)
      const map: Record<number, number | undefined> = {}
      for (const c of all) map[c.id] = c.status
      statusRef.current = map
      if (selectedId == null && all.length) setSelectedId(all[0].id)
    } catch (e: any) {
      // Даем человеку понятную подсказку, потому что "Unauthorized" чаще всего = не тот токен
      const msg = String(e?.message ?? e)
      const status = Number(e?.status)
      if (status === 401 || status === 403 || msg.toLowerCase().includes('unauthor')) {
        push(
          '❌ Не удалось загрузить кампании: Unauthorized.\n' +
            'Проверьте, что в "API токены" вы вставили именно токен типа "Реклама/Продвижение" ' +
            '(не токен отзывов) и что выбран правильный магазин.',
        )
      } else {
        push(`❌ Не удалось загрузить кампании: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCampaigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsToken, accountId])

  // Worker: проверка расписания 1 раз в минуту (MSK)
  useEffect(() => {
    if (!adsToken) return
    const t = window.setInterval(() => {
      const now = getMskParts()
      clearExpiredOverrides(accountId)
      for (const c of campaigns) {
        const st = getCampaignSchedulerSettings(accountId, c.id)
        if (!st.enabled) continue

        const schedule = getSchedule(accountId, c.id)
        const slotOn = !!schedule?.[now.dayIndex]?.[now.hour]

        const override = st.override
        const desired = override && override.untilMs > Date.now() ? override.mode === 'on' : slotOn

        const curStatus = statusRef.current[c.id]
        const isRunning = curStatus === 9
        // если неизвестен статус — пропускаем
        if (curStatus == null || !Number.isFinite(curStatus)) continue
        if (desired === isRunning) continue

        // Media: пробуем теми же эндпоинтами. Если WB вернет 4xx/404 — помечаем как неподдерживаемую, чтобы не спамить.
        if (c.kind === 'media' && unsupportedRef.current.has(c.id)) continue

        void queueRef.current!.add(() =>
          retryable(async () => {
            try {
              if (desired) {
                await startPromotionCampaign(adsToken, c.id)
                statusRef.current[c.id] = 9
                push(`🟢 Реклама включена: ${c.name}`)
              } else {
                await pausePromotionCampaign(adsToken, c.id)
                statusRef.current[c.id] = 11
                push(`🔴 Реклама выключена: ${c.name}`)
              }
            } catch (e: any) {
              const status = Number(e?.status)
              if (c.kind === 'media' && (status === 400 || status === 404 || status === 405)) {
                unsupportedRef.current.add(c.id)
                push(`⚠️ Управление media-кампанией через WB API недоступно: ${c.name}`)
                return
              }
              throw e
            }
          }),
        )
      }
    }, 60_000)
    // первый прогон сразу
    const h = window.setTimeout(() => {
      const now = getMskParts()
      clearExpiredOverrides(accountId)
      for (const c of campaigns) {
        const st = getCampaignSchedulerSettings(accountId, c.id)
        if (!st.enabled) continue
        const schedule = getSchedule(accountId, c.id)
        const slotOn = !!schedule?.[now.dayIndex]?.[now.hour]
        const override = st.override
        const desired = override && override.untilMs > Date.now() ? override.mode === 'on' : slotOn
        const curStatus = statusRef.current[c.id]
        const isRunning = curStatus === 9
        if (curStatus == null || !Number.isFinite(curStatus)) continue
        if (desired === isRunning) continue
        if (c.kind === 'media' && unsupportedRef.current.has(c.id)) continue
        void queueRef.current!.add(() =>
          retryable(async () => {
            try {
              if (desired) {
                await startPromotionCampaign(adsToken, c.id)
                statusRef.current[c.id] = 9
                push(`🟢 Реклама включена: ${c.name}`)
              } else {
                await pausePromotionCampaign(adsToken, c.id)
                statusRef.current[c.id] = 11
                push(`🔴 Реклама выключена: ${c.name}`)
              }
            } catch (e: any) {
              const status = Number(e?.status)
              if (c.kind === 'media' && (status === 400 || status === 404 || status === 405)) {
                unsupportedRef.current.add(c.id)
                push(`⚠️ Управление media-кампанией через WB API недоступно: ${c.name}`)
                return
              }
              throw e
            }
          }),
        )
      }
    }, 250)

    return () => {
      window.clearInterval(t)
      window.clearTimeout(h)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsToken, accountId, campaigns])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return campaigns.filter((c) => {
      const st = statusRef.current[c.id]
      const isRunning = st === 9
      const isPaused = st === 11
      if (filter === 'running' && !isRunning) return false
      if (filter === 'paused' && !isPaused) return false
      if (query && !c.name.toLowerCase().includes(query) && String(c.id) !== query) return false
      return true
    })
  }, [campaigns, filter, q])

  const selected = useMemo(() => filtered.find((c) => c.id === selectedId) ?? campaigns.find((c) => c.id === selectedId) ?? null, [filtered, campaigns, selectedId])

  const now = getMskParts()
  const schedule = scheduleState
  const hasSchedule = schedule ? hasAnyOn(schedule) : false

  useEffect(() => {
    if (!selected) {
      setScheduleState(null)
      return
    }
    const s = getSchedule(accountId, selected.id)
    setScheduleState(s)
    setCopyToDay((selected ? (now.dayIndex + 1) % 7 : 1) || 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, accountId])

  const saveSchedule = (next: AdsSchedule) => {
    if (!selected) return
    setScheduleState(next)
    setSchedule(accountId, selected.id, next)
  }

  const selectedSettings = selected ? getCampaignSchedulerSettings(accountId, selected.id) : null
  const selectedEnabled = !!selectedSettings?.enabled
  const currentStatus = selected ? statusRef.current[selected.id] : undefined
  const isRunning = currentStatus === 9
  const slotWantsOn = selected && schedule ? !!schedule?.[now.dayIndex]?.[now.hour] : false
  const override = selectedSettings?.override
  const desiredNow = override && override.untilMs > Date.now() ? override.mode === 'on' : slotWantsOn

  return (
    <div className="grid" style={{ gridTemplateColumns: '380px 1fr' }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700 }}>Реклама (WB Ads)</div>
          <button className="btn" onClick={() => void loadCampaigns()} disabled={loading}>
            {loading ? 'Загрузка…' : 'Обновить'}
          </button>
        </div>

        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="all">Все</option>
            <option value="running">Запущенные</option>
            <option value="paused">Приостановленные</option>
          </select>
          <input className="input" placeholder="Поиск по названию / ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="small muted" style={{ marginTop: 8 }}>
          Время: <b>{now.hm}</b> (МСК) • День: <b>{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][now.dayIndex]}</b>
        </div>

        <div className="list" style={{ marginTop: 12, maxHeight: '62vh', overflow: 'auto' }}>
          {filtered.map((c) => {
            const st = statusRef.current[c.id]
            const running = st === 9
            const paused = st === 11
            const s = getCampaignSchedulerSettings(accountId, c.id)
            const has = hasAnyOn(getSchedule(accountId, c.id))
            return (
              <div
                key={`${c.kind}-${c.id}`}
                className={cls('campaignRow', selectedId === c.id && 'isSelected')}
                onClick={() => setSelectedId(c.id)}
              >
                <div style={{ fontWeight: 650, lineHeight: 1.2 }}>{c.name}</div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  #{c.id} • {c.kind === 'promotion' ? 'Promotion' : 'Media'} •{' '}
                  {running ? '🟢 запущена' : paused ? '🟡 пауза' : `статус ${st ?? '—'}`} •{' '}
                  {s.enabled ? (has ? '📅 расписание' : '📅 (пусто)') : '📅 выкл'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        {!selected || !schedule ? (
          <div className="muted">Выберите кампанию слева</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  #{selected.id} • {selected.kind === 'promotion' ? 'Promotion' : 'Media'} •{' '}
                  {isRunning ? '🟢 сейчас запущена' : '🔴 сейчас выключена'}
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <label className="row" style={{ gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedEnabled}
                    onChange={(e) =>
                      setCampaignSchedulerSettings(accountId, selected.id, {
                        ...getCampaignSchedulerSettings(accountId, selected.id),
                        enabled: e.target.checked,
                      })
                    }
                  />
                  <span style={{ fontWeight: 700 }}>Календарь</span>
                </label>

                {unsupportedRef.current.has(selected.id) ? (
                  <div className="small muted">Управление этой кампанией через WB API недоступно</div>
                ) : (
                  <>
                    <button
                      className="btn"
                      onClick={() =>
                        void queueRef.current!.add(() =>
                          retryable(async () => {
                            try {
                              await startPromotionCampaign(adsToken, selected.id)
                              statusRef.current[selected.id] = 9
                              push('🟢 Включено вручную')
                            } catch (e: any) {
                              const status = Number(e?.status)
                              if (selected.kind === 'media' && (status === 400 || status === 404 || status === 405)) {
                                unsupportedRef.current.add(selected.id)
                                push('⚠️ Media-кампании нельзя запускать/останавливать через WB API')
                                return
                              }
                              throw e
                            }
                          }),
                        )
                      }
                    >
                      Включить сейчас
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        void queueRef.current!.add(() =>
                          retryable(async () => {
                            try {
                              await pausePromotionCampaign(adsToken, selected.id)
                              statusRef.current[selected.id] = 11
                              push('🔴 Выключено вручную')
                            } catch (e: any) {
                              const status = Number(e?.status)
                              if (selected.kind === 'media' && (status === 400 || status === 404 || status === 405)) {
                                unsupportedRef.current.add(selected.id)
                                push('⚠️ Media-кампании нельзя запускать/останавливать через WB API')
                                return
                              }
                              throw e
                            }
                          }),
                        )
                      }
                    >
                      Выключить сейчас
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => saveSchedule(setDayAll(schedule, now.dayIndex, true))}>
                Заполнить день
              </button>
              <button className="btn" onClick={() => saveSchedule(setDayAll(schedule, now.dayIndex, false))}>
                Очистить день
              </button>

              <div className="row" style={{ gap: 6 }}>
                <span className="small">Копировать день:</span>
                <select className="select" value={copyToDay} onChange={(e) => setCopyToDay(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      → {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][d]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  onClick={() => {
                    const next = copyDay(schedule, now.dayIndex, copyToDay)
                    saveSchedule(next)
                  }}
                >
                  Копировать
                </button>
              </div>

              <div className={cls('badge', desiredNow ? 'badgeOn' : 'badgeOff')}>
                {desiredNow ? 'Слот: ВКЛ' : 'Слот: ВЫКЛ'}
              </div>
              {override && override.untilMs > Date.now() && (
                <div className="badge">Override до {new Date(override.untilMs).toLocaleString('ru-RU')}</div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <AdsCalendar
                schedule={schedule}
                currentDayIndex={now.dayIndex}
                currentHour={now.hour}
                onChange={(next) => saveSchedule(next)}
              />
            </div>

            {selected.kind !== 'promotion' && (
              <div className="small muted" style={{ marginTop: 10 }}>
                Media-кампании сейчас отображаются и могут иметь расписание, но управление их запуском/паузой зависит от вашего токена и доступных методов WB.
              </div>
            )}

            {!selectedEnabled && hasSchedule && (
              <div className="small muted" style={{ marginTop: 10 }}>
                У вас заполнено расписание, но «Календарь» выключен — автоматическое управление не выполняется.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
