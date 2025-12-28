import React, { useEffect, useMemo, useState } from 'react'
import { WbHttpError } from '../../api/wbClient'
import { validateAdsToken } from '../../api/wbAdsClient'
import { getSellerInfo } from '../../api/wbCommonClient'
import { getMediaCampaignCount } from '../../api/wbAdsManageClient'
import type { WbAccount } from './accountsStorage'
import { useToast } from '../../components/Toast'
import { ACCESS_SECTIONS, detectOpenApiStrategy, formatAccessError, openApiFetch } from '../../api/wbOpenApiClient'

export default function ApiTokensModal({
  open,
  accounts,
  activeId,
  onClose,
  onSave,
  onSetActive,
}: {
  open: boolean
  accounts: WbAccount[]
  activeId: string | null
  onClose: () => void
  onSave: (next: WbAccount[]) => void
  onSetActive: (id: string) => void
}) {
  const { push } = useToast()
  const [draftAccounts, setDraftAccounts] = useState<WbAccount[]>(accounts)
  const [selectedId, setSelectedId] = useState<string | null>(activeId)

  useEffect(() => {
    if (!open) return
    setDraftAccounts(accounts)
    setSelectedId(activeId || accounts[0]?.id || null)
  }, [open, accounts, activeId])

  const selected = useMemo(() => draftAccounts.find((a) => a.id === selectedId) ?? null, [draftAccounts, selectedId])

  const setSelectedField = (patch: Partial<WbAccount>) => {
    if (!selected) return
    setDraftAccounts((prev) => prev.map((a) => (a.id === selected.id ? { ...a, ...patch } : a)))
  }

  const upsertAccount = () => {
    const id = `acc_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const acc: WbAccount = { id, name: 'Новый магазин', sellerToken: '', adsToken: '' }
    setDraftAccounts((p) => [acc, ...p])
    setSelectedId(id)
  }

  const removeSelected = () => {
    if (!selected) return
    const next = draftAccounts.filter((a) => a.id !== selected.id)
    setDraftAccounts(next)
    const nextId = next[0]?.id || null
    setSelectedId(nextId)
    if (activeId === selected.id && nextId) onSetActive(nextId)
  }

  const commitAndClose = () => {
    onSave(draftAccounts)
    if (selectedId) onSetActive(selectedId)
    onClose()
  }

  function markAccess(v?: 'ok' | 'error' | 'warn') {
    if (!v) return '—'
    if (v === 'ok') return '✅'
    if (v === 'warn') return '⚠️'
    return '❌'
  }

  function markAds(hasToken: boolean, v?: boolean) {
    if (!hasToken) return '—'
    if (v === true) return '✅'
    if (v === false) return '❌'
    return '⏳'
  }

  function fmtErr(e: any) {
    return e instanceof WbHttpError ? `${e.status}: ${e.detail || e.message}` : String(e?.message ?? e)
  }

  // auto-save on click outside (по ТЗ)
  if (!open) return null

  return (
    <div
      className="modalOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) commitAndClose()
      }}
    >
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div style={{ fontWeight: 800 }}>API токены</div>
          <button className="btn" onClick={commitAndClose}>
            Закрыть
          </button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '320px 1fr', marginTop: 12 }}>
          <div className="card" style={{ borderRadius: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>Магазины</div>
              <button className="btn" onClick={upsertAccount}>
                + Добавить
              </button>
            </div>
            <div className="list" style={{ marginTop: 10, maxHeight: '52vh', overflow: 'auto' }}>
              {draftAccounts.map((a) => (
                <div
                  key={a.id}
                  className={['campaignRow', selectedId === a.id ? 'isSelected' : ''].join(' ')}
                  onClick={() => setSelectedId(a.id)}
                >
                  <div style={{ fontWeight: 700 }}>{a.name}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {markAccess(a.tokenChecks?.access?.feedbacks)} WB API • {markAds(!!a.adsToken, a.tokenChecks?.adsPromotion ?? a.tokenChecks?.adsMedia)} реклама
                    {activeId === a.id ? ' • (активный)' : ''}
                  </div>
                </div>
              ))}
              {draftAccounts.length === 0 && <div className="muted">Нет сохранённых магазинов</div>}
            </div>
          </div>

          <div className="card" style={{ borderRadius: 12 }}>
            {!selected ? (
              <div className="muted">Выберите магазин слева</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input"
                      value={selected.name}
                      onChange={(e) => setSelectedField({ name: e.target.value })}
                      placeholder="Название магазина"
                      style={{ width: 'min(520px, 90vw)' }}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        onSetActive(selected.id)
                        push('Аккаунт выбран')
                      }}
                    >
                      Сделать активным
                    </button>
                  </div>
                  <button className="btn" onClick={removeSelected}>
                    Удалить
                  </button>
                </div>

                <div className="small muted" style={{ marginTop: 8 }}>
                  Токены сохраняются локально. Закрытие окна сохраняет изменения автоматически.
                </div>

                <div className="row" style={{ marginTop: 12, gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>WB OpenAPI (единый токен)</div>
                    <textarea
                      className="textarea"
                      value={selected.sellerToken}
                      onChange={(e) => setSelectedField({ sellerToken: e.target.value })}
                      placeholder="Единый токен WB OpenAPI"
                    />
                    <div className="row" style={{ marginTop: 8, gap: 8 }}>
                      <button
                        className="btn primary"
                        onClick={async () => {
                          const t = selected.sellerToken.trim()
                          const checks = {
                            ...(selected.tokenChecks ?? {}),
                            checkedAtMs: Date.now(),
                          } as NonNullable<WbAccount['tokenChecks']>

                          const errors: string[] = []
                          let strategyId = selected.openApiStrategyId
                          let strategyConfirmedBy = selected.openApiStrategyConfirmedBy
                          let strategyCheckedAtMs = selected.openApiStrategyCheckedAtMs

                          try {
                            const strategy = await detectOpenApiStrategy(t)
                            strategyId = strategy.strategyId
                            strategyConfirmedBy = strategy.confirmedBy
                            strategyCheckedAtMs = strategy.checkedAtMs
                          } catch (e: any) {
                            errors.push(`Стратегия: ${fmtErr(e)}`)
                          }

                          const access: NonNullable<WbAccount['tokenChecks']>['access'] = {}
                          const accessMessages: NonNullable<WbAccount['tokenChecks']>['accessMessages'] = {}

                          for (const section of ACCESS_SECTIONS) {
                            let ok = false
                            let lastInfo: ReturnType<typeof formatAccessError> | null = null
                            for (const probe of section.probes) {
                              try {
                                await openApiFetch<any>(t, section.id, probe.path, { method: probe.method ?? 'GET', query: probe.query }, strategyId)
                                ok = true
                                break
                              } catch (e: any) {
                                lastInfo = formatAccessError(e)
                                if (lastInfo.status === 401 || lastInfo.status === 403) {
                                  break
                                }
                              }
                            }

                            if (ok) {
                              access[section.id] = 'ok'
                              continue
                            }

                            if (!lastInfo) lastInfo = { message: 'Не удалось проверить доступ' }
                            if (lastInfo.status === 401 || lastInfo.status === 403 || lastInfo.status === 404) {
                              access[section.id] = 'error'
                            } else {
                              access[section.id] = 'warn'
                            }
                            accessMessages[section.id] = lastInfo.message
                            errors.push(`${section.label}: ${lastInfo.message}`)
                          }

                          checks.access = access
                          checks.accessMessages = accessMessages

                          // Название магазина (не влияет на валидность)
                          try {
                            const info = await getSellerInfo(t, strategyId)
                            const newName = String(info?.tradeMark || info?.name || selected.name || 'Магазин')
                            setSelectedField({
                              name: newName,
                              sellerSid: info?.sid,
                              tokenChecks: checks,
                              openApiStrategyId: strategyId,
                              openApiStrategyConfirmedBy: strategyConfirmedBy,
                              openApiStrategyCheckedAtMs: strategyCheckedAtMs,
                            })
                          } catch {
                            setSelectedField({
                              tokenChecks: checks,
                              openApiStrategyId: strategyId,
                              openApiStrategyConfirmedBy: strategyConfirmedBy,
                              openApiStrategyCheckedAtMs: strategyCheckedAtMs,
                            })
                          }

                          const parts: string[] = []
                          parts.push(`OpenAPI: ${markAccess(access.feedbacks)}`)
                          parts.push(`Контент: ${markAccess(access.content)}`)
                          parts.push(`Цены: ${markAccess(access.prices)}`)
                          push(parts.join(' • '))
                          if (errors.length > 0) {
                            push(errors.slice(0, 2).join(' | '))
                          }
                        }}
                        disabled={!selected.sellerToken.trim()}
                      >
                        Проверить
                      </button>
                    </div>
                    <div className="accessPanel">
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700 }}>Доступ по разделам</div>
                        {selected.openApiStrategyId && (
                          <div className="small muted">Strategy {selected.openApiStrategyId}</div>
                        )}
                      </div>
                      <div className="list" style={{ marginTop: 8 }}>
                        {ACCESS_SECTIONS.map((section) => (
                          <div key={section.id} className="accessRow">
                            <div>
                              <div style={{ fontWeight: 600 }}>{section.label}</div>
                              {selected.tokenChecks?.accessMessages?.[section.id] && (
                                <div className="small muted">{selected.tokenChecks?.accessMessages?.[section.id]}</div>
                              )}
                            </div>
                            <div>{markAccess(selected.tokenChecks?.access?.[section.id])}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>WB Ads API (Promotion)</div>
                    <textarea
                      className="textarea"
                      value={selected.adsToken}
                      onChange={(e) => setSelectedField({ adsToken: e.target.value })}
                      placeholder="Токен WB Ads (Promotion)"
                    />
                    {selected.tokenChecks?.adsPromotion === false && (
                      <div className="small" style={{ color: '#b00020', marginTop: 6 }}>
                        WB Ads API: 401 — проверь Promotion токен
                      </div>
                    )}
                    <div className="row" style={{ marginTop: 8, gap: 8 }}>
                      <button
                        className="btn primary"
                        onClick={async () => {
                          const t = selected.adsToken.trim()
                          const checks = {
                            ...(selected.tokenChecks ?? {}),
                            checkedAtMs: Date.now(),
                          } as NonNullable<WbAccount['tokenChecks']>

                          const errors: string[] = []

                          try {
                            await validateAdsToken(t)
                            checks.adsPromotion = true
                          } catch (e: any) {
                            checks.adsPromotion = false
                            errors.push(`Promotion: ${fmtErr(e)}`)
                          }

                          // Media часть может быть недоступна у некоторых кабинетов.
                          try {
                            await getMediaCampaignCount(t)
                            checks.adsMedia = true
                          } catch (e: any) {
                            checks.adsMedia = false
                            errors.push(`Media: ${fmtErr(e)}`)
                          }

                          setSelectedField({ tokenChecks: checks })

                          const parts: string[] = []
                          parts.push(`${checks.adsPromotion ? '✅' : '❌'} promotion`)
                          parts.push(`${checks.adsMedia ? '✅' : '❌'} media`)
                          push(parts.join(' • '))
                          if (errors.length > 0) push(errors.slice(0, 2).join(' | '))
                        }}
                        disabled={!selected.adsToken.trim()}
                      >
                        Проверить
                      </button>
                    </div>
                  </div>
                </div>

                <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn" onClick={commitAndClose}>
                    Сохранить
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
