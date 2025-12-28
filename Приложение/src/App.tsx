import React, { useEffect, useMemo, useState } from 'react'
import FiltersBar, { type FiltersState } from './components/FiltersBar'
import FeedbackList from './components/FeedbackList'
import { ToastProvider, useToast } from './components/Toast'
import { SplashScreen } from './components/SplashScreen'
import AutoReplyPanel from './components/AutoReplyPanel'
import AbTestsPage from './abTests/AbTestsPage'
import AdsSchedulerPage from './features/adsScheduler/AdsSchedulerPage'
import { UnitEconomyPage } from './features/unitEconomy/UnitEconomyPage'
import ApiTokensModal from './features/accounts/ApiTokensModal'
import { ensureMigrationFromLegacy, getActiveAccountId, loadAccounts, saveAccounts, setActiveAccountId, type WbAccount } from './features/accounts/accountsStorage'
import { AUTO_REPLY_TEMPLATE_EXAMPLE, DEFAULTS, STORAGE_KEYS } from './config'
import {
  editFeedbackReply,
  isAuthError,
  listFeedbacks,
  replyToFeedback,
  safeReloadBoth,
  unixSecondsDaysBack,
  WbHttpError,
} from './api/wbClient'
import { detectOpenApiStrategy, formatAccessError, type OpenApiStrategyResult } from './api/wbOpenApiClient'
import DevConsole from './components/DevConsole'
import type { AutoReplyRule, FeedbackDto, FeedbackVm } from './types'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function formatInterval(ms: number) {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (m === 0) return `${h} ч`
  return `${h}ч ${m}м`
}

function answeredKey(accountId: string | null) {
  return accountId ? `${STORAGE_KEYS.answeredIds}_${accountId}` : STORAGE_KEYS.answeredIds
}

function loadAnsweredIds(accountId: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(answeredKey(accountId))
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.map(String))
  } catch {
    return new Set()
  }
}

function saveAnsweredIds(accountId: string | null, ids: Set<string>) {
  try {
    localStorage.setItem(answeredKey(accountId), JSON.stringify(Array.from(ids)))
  } catch {
    // ignore
  }
}

function AppInner() {
  const { push } = useToast()

  // ---- accounts ----
  const [accounts, setAccounts] = useState<WbAccount[]>(() => {
    ensureMigrationFromLegacy()
    return loadAccounts()
  })
  const [activeId, setActiveId] = useState<string | null>(() => getActiveAccountId() || null)
  const activeAccount = useMemo(() => accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null, [accounts, activeId])

  useEffect(() => {
    if (!activeAccount) return
    if (activeId !== activeAccount.id) {
      setActiveId(activeAccount.id)
      setActiveAccountId(activeAccount.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id])

  const sellerToken = (activeAccount?.sellerToken ?? '').trim()
  const adsToken = (activeAccount?.adsToken ?? '').trim()
  const openApiStrategyId = activeAccount?.openApiStrategyId

  const [apiModalOpen, setApiModalOpen] = useState(false)
  const [devConsoleOpen, setDevConsoleOpen] = useState(false)
  const [strategyChecking, setStrategyChecking] = useState(false)

  // ---- auto refresh ----
  const [autoRefreshMs, setAutoRefreshMs] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.autoRefreshMs)
    const v = raw ? Number(raw) : NaN
    return Number.isFinite(v) && v > 0 ? v : DEFAULTS.autoRefreshMs
  })
  const [autoRefreshUiOpen, setAutoRefreshUiOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.autoRefreshMs, String(autoRefreshMs))
    } catch {
      // ignore
    }
  }, [autoRefreshMs])

  // ---- app state ----
  const [tab, setTab] = useState<'reviews' | 'adsScheduler' | 'unitEconomy' | 'abtests'>('reviews')
  const [loading, setLoading] = useState(false)
  const [fatalError, setFatalError] = useState<string>('')

  const [filters, setFilters] = useState<FiltersState>({
    answer: 'unanswered',
    rating: 'all',
    q: '',
    daysBack: DEFAULTS.daysBack as any,
  })

  const [items, setItems] = useState<FeedbackVm[]>([])
  const [autoReplying, setAutoReplying] = useState(false)
  const [autoReplyProgress, setAutoReplyProgress] = useState<{ done: number; total: number } | null>(null)
  const [autoPanelOpen, setAutoPanelOpen] = useState(false)

  const [autoRules, setAutoRules] = useState<AutoReplyRule[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.autoReplyRules)
      if (raw) return JSON.parse(raw)
    } catch {}
    return [
      {
        id: 'r1',
        enabled: true,
        ratings: [5],
        onlyUnanswered: true,
        textMode: 'noText',
        replyText: AUTO_REPLY_TEMPLATE_EXAMPLE,
      },
      { id: 'r2', enabled: false, ratings: [5], onlyUnanswered: true, textMode: 'withText', replyText: '' },
      { id: 'r3', enabled: false, ratings: [4], onlyUnanswered: true, textMode: 'withText', replyText: '' },
    ]
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.autoReplyRules, JSON.stringify(autoRules))
    } catch {
      // ignore
    }
  }, [autoRules])

  useEffect(() => {
    if (!sellerToken || !activeAccount || activeAccount.openApiStrategyId || strategyChecking) return
    let cancelled = false
    const run = async () => {
      setStrategyChecking(true)
      try {
        const result: OpenApiStrategyResult = await detectOpenApiStrategy(sellerToken)
        if (cancelled) return
        const next = accounts.map((acc) =>
          acc.id === activeAccount.id
            ? {
                ...acc,
                openApiStrategyId: result.strategyId,
                openApiStrategyConfirmedBy: result.confirmedBy,
                openApiStrategyCheckedAtMs: result.checkedAtMs,
              }
            : acc,
        )
        setAccounts(next)
        saveAccounts(next)
        push(`OpenAPI стратегия: ${result.strategyId} • ${result.confirmedBy}`)
        console.info('[WB OpenAPI] strategy selected', result)
      } catch (e) {
        const info = formatAccessError(e)
        push(`OpenAPI стратегия не выбрана: ${info.message}`)
      } finally {
        setStrategyChecking(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerToken, activeAccount?.id, activeAccount?.openApiStrategyId])

  const derived = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    let arr = items

    if (filters.answer !== 'all') {
      const wantAnswered = filters.answer === 'answered'
      arr = arr.filter((x) => !!x.dto.answer?.text === wantAnswered)
    }

    if (filters.rating !== 'all') {
      arr = arr.filter((x) => x.dto.productValuation === filters.rating)
    }

    if (q) {
      arr = arr.filter((x) => {
        const name = x.dto.productDetails?.productName ?? ''
        const text = x.dto.text ?? ''
        const pros = x.dto.pros ?? ''
        const cons = x.dto.cons ?? ''
        const ans = x.dto.answer?.text ?? ''
        return [name, text, pros, cons, ans].join('\n').toLowerCase().includes(q)
      })
    }

    // по умолчанию dateDesc
    arr = [...arr].sort((a, b) => {
      const da = new Date(a.dto.createdDate).getTime()
      const db = new Date(b.dto.createdDate).getTime()
      return db - da
    })

    return arr
  }, [items, filters])

  // ---- answered counter ----
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(() => loadAnsweredIds(activeAccount?.id ?? null))

  useEffect(() => {
    setAnsweredIds(loadAnsweredIds(activeAccount?.id ?? null))
  }, [activeAccount?.id])

  useEffect(() => {
    const onAnswered = (ev: any) => {
      const id = String(ev?.detail?.id ?? '')
      if (!id) return
      setAnsweredIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        saveAnsweredIds(activeAccount?.id ?? null, next)
        return next
      })
    }
    window.addEventListener('wb:answered', onAnswered as any)
    return () => window.removeEventListener('wb:answered', onAnswered as any)
  }, [activeAccount?.id])

  function toVm(dto: FeedbackDto): FeedbackVm {
    const existing = dto.answer?.text ?? ''
    return {
      dto,
      answerDraft: existing,
      lastSentAnswer: existing,
      sendStatus: { kind: 'idle' },
    }
  }

  function mergeDtosToState(dtos: FeedbackDto[]) {
    setItems((prev) => {
      const byId = new Map(prev.map((x) => [x.dto.id, x]))
      for (const dto of dtos) {
        const old = byId.get(dto.id)
        if (!old) {
          byId.set(dto.id, toVm(dto))
          continue
        }

        // сохраняем локальный ввод пользователя, если он уже начал печатать
        const userEditing = old.answerDraft.trim() !== old.lastSentAnswer.trim()
        const existingAnswer = dto.answer?.text ?? ''

        byId.set(dto.id, {
          ...old,
          dto,
          answerDraft: userEditing ? old.answerDraft : existingAnswer,
          lastSentAnswer: userEditing ? old.lastSentAnswer : existingAnswer,
        })
      }
      return Array.from(byId.values())
    })
  }

  async function refresh() {
    if (!sellerToken) return
    setLoading(true)
    setFatalError('')
    const { dateFrom, dateTo } = unixSecondsDaysBack(filters.daysBack)

    try {
      let dtos: FeedbackDto[] = []
      if (filters.answer === 'answered') {
        const r = await listFeedbacks(sellerToken, { isAnswered: true, dateFrom, dateTo, order: 'dateDesc' }, openApiStrategyId)
        dtos = r.data.feedbacks
      } else if (filters.answer === 'unanswered') {
        const r = await listFeedbacks(sellerToken, { isAnswered: false, dateFrom, dateTo, order: 'dateDesc' }, openApiStrategyId)
        dtos = r.data.feedbacks
      } else {
        const r = await safeReloadBoth(sellerToken, { dateFrom, dateTo }, openApiStrategyId)
        dtos = [...r.unanswered.data.feedbacks, ...r.answered.data.feedbacks]
      }

      mergeDtosToState(dtos)
      push(`Загружено отзывов: ${dtos.length}`)
    } catch (e: any) {
      if (isAuthError(e)) {
        setFatalError('Токен недействителен или нет доступа (401/403).')
        return
      }
      if (e instanceof WbHttpError) {
        const msg = e.detail ? `${e.status}: ${e.detail}` : `${e.status}: ${e.message}`
        setFatalError(msg)
      } else {
        setFatalError(String(e?.message ?? e))
      }
    } finally {
      setLoading(false)
    }
  }

  // автообновление
  useEffect(() => {
    if (!sellerToken) return
    if (tab !== 'reviews') return
    const t = window.setInterval(() => {
      void refresh()
    }, autoRefreshMs)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerToken, autoRefreshMs, tab, filters])

  useEffect(() => {
    // при смене аккаунта — чистим список и ошибки
    setItems([])
    setFatalError('')
    if (sellerToken) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id])

  useEffect(() => {
    const buffer: string[] = []
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName.toLowerCase()
        if (['input', 'textarea', 'select'].includes(tag) || target.isContentEditable) return
      }
      if (e.key.length !== 1) return
      buffer.push(e.key.toLowerCase())
      if (buffer.length > 4) buffer.shift()
      if (buffer.join('') === 'root') {
        setDevConsoleOpen((v) => !v)
        buffer.length = 0
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function isNoText(dto: FeedbackDto) {
    const t = (dto.text ?? '').trim()
    const p = (dto.pros ?? '').trim()
    const c = (dto.cons ?? '').trim()
    return !t && !p && !c
  }

  function matchesRule(rule: AutoReplyRule, vm: FeedbackVm) {
    const dto = vm.dto
    if (rule.onlyUnanswered && !!dto.answer?.text) return false
    if (rule.ratings.length > 0 && !rule.ratings.includes(dto.productValuation)) return false
    const empty = isNoText(dto)
    if (rule.textMode === 'noText' && !empty) return false
    if (rule.textMode === 'withText' && empty) return false
    return true
  }

  async function runAutoReplies(rulesToUse: AutoReplyRule[]) {
    if (!sellerToken) return
    if (autoReplying) return

    const enabledRules = rulesToUse.filter((r) => r.enabled)
    if (enabledRules.length === 0) {
      push('Нет включенных правил')
      return
    }

    const targets = derived.filter((vm) => enabledRules.some((r) => matchesRule(r, vm)))
    if (targets.length === 0) {
      push('Нет подходящих отзывов')
      return
    }

    setAutoReplying(true)
    setAutoReplyProgress({ done: 0, total: targets.length })
    push(`Автоответы: ${targets.length} шт.`)

    try {
      let done = 0
      for (const vm of targets) {
        const dto = vm.dto
        const rule = enabledRules.find((r) => matchesRule(r, vm))
        if (!rule) continue
        const text = (rule.replyText || '').trim()
        if (text.length < 2) continue

        try {
          if (dto.answer?.text) {
            await editFeedbackReply(sellerToken, dto.id, text, openApiStrategyId)
          } else {
            await replyToFeedback(sellerToken, dto.id, text, openApiStrategyId)
          }
          // отметим как «отвечено через приложение»
          try {
            window.dispatchEvent(new CustomEvent('wb:answered', { detail: { id: dto.id } }))
          } catch {}
          setItems((prev) =>
            prev.map((item) =>
              item.dto.id === dto.id
                ? {
                    ...item,
                    answerDraft: text,
                    lastSentAnswer: text,
                    sendStatus: { kind: 'sent' },
                    dto: {
                      ...item.dto,
                      answer: { text, state: item.dto.answer?.state ?? 'wbRu', editable: item.dto.answer?.editable ?? false },
                    },
                  }
                : item,
            ),
          )
          done += 1
          setAutoReplyProgress({ done, total: targets.length })
        } catch (e) {
          // ошибки уже ретраятся в wbFetch; здесь просто продолжаем
        }

        // задержка (по ТЗ) чтобы не ловить лимиты
        await sleep(DEFAULTS.autoReplyDelayMs)
      }
    } finally {
      setAutoReplying(false)
      setAutoReplyProgress(null)
    }
  }

  // если нет аккаунтов — сразу открываем окно токенов
  useEffect(() => {
    if (accounts.length === 0) setApiModalOpen(true)
  }, [accounts.length])

  // UI
  return (
    <div className="container">
      <ApiTokensModal
        open={apiModalOpen}
        accounts={accounts}
        activeId={activeAccount?.id ?? null}
        onClose={() => setApiModalOpen(false)}
        onSave={(next) => {
          setAccounts(next)
          saveAccounts(next)
        }}
        onSetActive={(id) => {
          setActiveId(id)
          setActiveAccountId(id)
        }}
      />

      <div className="header">
        <div className="brand">
          <h1>WB Seller Tools</h1>
          <span className="badge">local</span>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <select
            className="select"
            value={activeAccount?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value
              setActiveId(id)
              setActiveAccountId(id)
            }}
          >
            {accounts.map((a: WbAccount) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <button className="btn" onClick={() => setApiModalOpen(true)}>
            API токены
          </button>

          <div style={{ position: 'relative' }}>
            <button className="btn" onClick={() => setAutoRefreshUiOpen((v) => !v)}>
              Автообновление: {formatInterval(autoRefreshMs)}
            </button>
            {autoRefreshUiOpen && (
              <div className="popover" onMouseLeave={() => setAutoRefreshUiOpen(false)}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Интервал автообновления</div>
                <input
                  type="range"
                  min={1}
                  max={1440}
                  step={1}
                  value={Math.round(autoRefreshMs / 60000)}
                  onChange={(e) => setAutoRefreshMs(Number(e.target.value) * 60000)}
                  style={{ width: 320 }}
                />
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 6, width: 320 }}>
                  <span className="small">1 мин</span>
                  <span className="small">1 день</span>
                </div>
                <div className="badge" style={{ display: 'inline-block', marginTop: 10 }}>
                  Сейчас: {formatInterval(autoRefreshMs)}
                </div>
              </div>
            )}
          </div>

          <button className={tab === 'reviews' ? 'btn primary' : 'btn'} onClick={() => setTab('reviews')}>
            Отзывы
          </button>
          <button className={tab === 'adsScheduler' ? 'btn primary' : 'btn'} onClick={() => setTab('adsScheduler')}>
            Реклама
          </button>
          <button className={tab === 'unitEconomy' ? 'btn primary' : 'btn'} onClick={() => setTab('unitEconomy')}>
            Юнит-экономика
          </button>
          <button className={tab === 'abtests' ? 'btn primary' : 'btn'} onClick={() => setTab('abtests')}>
            A/B
          </button>
        </div>
      </div>

      <AutoReplyPanel
        open={autoPanelOpen}
        onClose={() => setAutoPanelOpen(false)}
        rules={autoRules}
        onChangeRules={setAutoRules}
        items={items}
        onRun={(r) => void runAutoReplies(r)}
        running={autoReplying}
        progress={autoReplyProgress}
      />

      {tab === 'reviews' && (
        <>
          <FiltersBar
            value={filters}
            onChange={setFilters}
            onRefresh={refresh}
            onOpenAutoReplies={() => setAutoPanelOpen(true)}
            loading={loading}
          />

          {fatalError && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="error" style={{ fontWeight: 800 }}>
                Ошибка загрузки
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {fatalError}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={refresh}>
                  Повторить загрузку
                </button>
              </div>
            </div>
          )}

          {!sellerToken && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800 }}>Нет токена для отзывов</div>
              <div className="small muted" style={{ marginTop: 6 }}>
                Откройте «API токены» и укажите токен для отзывов.
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={() => setApiModalOpen(true)}>
                  Открыть API токены
                </button>
              </div>
            </div>
          )}

          {sellerToken && (
            <div className="grid">
              <div className="summaryColumn">
                <div className="card summaryCard">
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Сводка</div>
                  <div className="small">
                    Всего в списке: <b>{items.length}</b>
                  </div>
                  <div className="small">
                    После фильтров: <b>{derived.length}</b>
                  </div>
                  <div className="small">
                    Отвечено через приложение: <b>{answeredIds.size}</b>
                  </div>
                  <div className="small" style={{ marginTop: 8 }}>
                    Подсказка: вставка в поле ответа отправляет ответ сразу. Ручной ввод отправится через{' '}
                    {DEFAULTS.typingDebounceMs / 1000}с после паузы или при уходе с поля.
                  </div>
                </div>
                {devConsoleOpen && (
                  <DevConsole
                    accountId={activeAccount?.id ?? 'default'}
                    sellerToken={sellerToken}
                    adsToken={adsToken}
                    strategyId={openApiStrategyId}
                    strategyConfirmedBy={activeAccount?.openApiStrategyConfirmedBy ?? ''}
                  />
                )}
              </div>

              <FeedbackList
                token={sellerToken}
                strategyId={openApiStrategyId}
                items={derived}
                onUpdateItem={(id, next) => {
                  setItems((prev) => prev.map((x) => (x.dto.id === id ? next : x)))
                }}
              />
            </div>
          )}
        </>
      )}

      {tab === 'adsScheduler' && (
        <>
          {!adsToken ? (
            <div className="card">
              <div style={{ fontWeight: 800 }}>Нет токена для рекламы (Promotion)</div>
              <div className="small muted" style={{ marginTop: 6 }}>
                Откройте «API токены» и укажите токен для рекламы.
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={() => setApiModalOpen(true)}>
                  Открыть API токены
                </button>
              </div>
            </div>
          ) : (
            <AdsSchedulerPage accountId={activeAccount?.id ?? 'default'} adsToken={adsToken} />
          )}
        </>
      )}


      {tab === 'unitEconomy' && <UnitEconomyPage accountId={activeAccount?.id ?? 'default'} />}

      {tab === 'abtests' && <AbTestsPage sellerToken={sellerToken} adsToken={adsToken || null} openApiStrategyId={openApiStrategyId} />}
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  return (
    <ToastProvider>
      {!ready && <SplashScreen ms={2000} onDone={() => setReady(true)} />}
      {ready && <AppInner />}
    </ToastProvider>
  )
}
