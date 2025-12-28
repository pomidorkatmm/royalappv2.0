import React, { useMemo, useState } from 'react'
import type { AutoReplyRule, FeedbackDto, FeedbackVm } from '../types'
import { LIMITS } from '../config'

function hasNoText(dto: FeedbackDto) {
  const t = (dto.text ?? '').trim()
  const p = (dto.pros ?? '').trim()
  const c = (dto.cons ?? '').trim()
  return !t && !p && !c
}

function matchesRule(rule: AutoReplyRule, vm: FeedbackVm) {
  const dto = vm.dto
  if (rule.onlyUnanswered && !!dto.answer?.text) return false

  const r = dto.productValuation
  if (rule.ratings.length > 0 && !rule.ratings.includes(r)) return false

  const empty = hasNoText(dto)
  if (rule.textMode === 'noText' && !empty) return false
  if (rule.textMode === 'withText' && empty) return false

  return true
}

function validateReply(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return 'Ответ пустой'
  if (trimmed.length < LIMITS.answerTextMin) return `Минимум ${LIMITS.answerTextMin} символа`
  if (trimmed.length > LIMITS.answerTextMax) return `Максимум ${LIMITS.answerTextMax} символов`
  return null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function AutoReplyPanel({
  open,
  onClose,
  rules,
  onChangeRules,
  items,
  onRun,
  running,
  progress,
}: {
  open: boolean
  onClose: () => void
  rules: AutoReplyRule[]
  onChangeRules: (next: AutoReplyRule[]) => void
  items: FeedbackVm[]
  onRun: (rules: AutoReplyRule[]) => void
  running: boolean
  progress: { done: number; total: number } | null
}) {
  const [localError, setLocalError] = useState<string>('')

  const preview = useMemo(() => {
    const enabled = rules.filter((r) => r.enabled)
    if (!enabled.length) return { total: 0, byRule: [] as { id: string; count: number }[] }
    const byRule = enabled.map((r) => ({ id: r.id, count: items.filter((x) => matchesRule(r, x)).length }))
    const total = byRule.reduce((a, b) => a + b.count, 0)
    return { total, byRule }
  }, [rules, items])

  if (!open) return null

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <div style={{ fontWeight: 700 }}>Автоответы по правилам</div>
          <button className="btn" onClick={onClose} disabled={running}>
            Закрыть
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 6 }}>
          Выберите условия и текст ответа. Затем нажмите «Ответить». Отправка идёт последовательно, чтобы не словить лимиты.
        </div>

        {localError && (
          <div className="card" style={{ marginTop: 10, borderColor: '#c33' }}>
            <div className="error">{localError}</div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {rules.map((r) => {
            const err = validateReply(r.replyText)
            return (
              <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <label className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) =>
                        onChangeRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))
                      }
                      disabled={running}
                    />
                    <span style={{ fontWeight: 600 }}>Правило</span>
                  </label>

                  <button
                    className="btn"
                    onClick={() => onChangeRules(rules.filter((x) => x.id !== r.id))}
                    disabled={running}
                  >
                    Удалить
                  </button>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                  <div>
                    <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
                      Оценка
                    </div>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} className="row" style={{ gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={r.ratings.includes(n)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(new Set([...r.ratings, n])).sort()
                                : r.ratings.filter((x) => x !== n)
                              onChangeRules(rules.map((x) => (x.id === r.id ? { ...x, ratings: next } : x)))
                            }}
                            disabled={running}
                          />
                          <span>{n}★</span>
                        </label>
                      ))}
                      <span className="small muted">(если не выбрать — любая)</span>
                    </div>

                    <div className="row" style={{ marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
                      <label className="row" style={{ gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={r.onlyUnanswered}
                          onChange={(e) =>
                            onChangeRules(
                              rules.map((x) => (x.id === r.id ? { ...x, onlyUnanswered: e.target.checked } : x)),
                            )
                          }
                          disabled={running}
                        />
                        <span>Только без ответа</span>
                      </label>

                      <label className="row" style={{ gap: 8 }}>
                        <span>Текст отзыва:</span>
                        <select
                          value={r.textMode}
                          onChange={(e) =>
                            onChangeRules(
                              rules.map((x) => (x.id === r.id ? { ...x, textMode: e.target.value as any } : x)),
                            )
                          }
                          disabled={running}
                        >
                          <option value="any">любой</option>
                          <option value="noText">без текста</option>
                          <option value="withText">с текстом</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
                      Текст ответа
                    </div>
                    <textarea
                      className="textarea"
                      value={r.replyText}
                      onChange={(e) =>
                        onChangeRules(rules.map((x) => (x.id === r.id ? { ...x, replyText: e.target.value } : x)))
                      }
                      rows={6}
                      placeholder="Введите текст ответа (будет отправлен всем совпавшим отзывам)"
                      disabled={running}
                    />
                    {err ? (
                      <div className="small" style={{ color: '#c33', marginTop: 6 }}>
                        {err}
                      </div>
                    ) : (
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Длина: {r.replyText.trim().length}/{LIMITS.answerTextMax}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() =>
              onChangeRules([
                ...rules,
                {
                  id: uid(),
                  enabled: true,
                  ratings: [],
                  onlyUnanswered: true,
                  textMode: 'any',
                  replyText: '',
                },
              ])
            }
            disabled={running}
          >
            + Добавить правило
          </button>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="badge">Совпадений: {preview.total}</span>
            <button
              className="btn"
              onClick={() => {
                setLocalError('')
                const enabled = rules.filter((r) => r.enabled)
                if (!enabled.length) {
                  setLocalError('Включите хотя бы одно правило')
                  return
                }
                for (const r of enabled) {
                  const err = validateReply(r.replyText)
                  if (err) {
                    setLocalError(`Правило: ${err}`)
                    return
                  }
                }
                onRun(rules)
              }}
              disabled={running}
            >
              {running && progress ? `Отправка: ${progress.done}/${progress.total}` : 'Ответить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
