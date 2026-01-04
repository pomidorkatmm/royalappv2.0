import React from 'react'
import AnswerBox from './AnswerBox'
import { useToast } from './Toast'
import { editFeedbackReply, replyToFeedback, WbHttpError } from '../api/wbClient'
import { LIMITS } from '../config'
import type { FeedbackVm } from '../types'

function stars(n: number) {
  const full = '★★★★★'.slice(0, Math.max(0, Math.min(5, n)))
  const empty = '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)))
  return full + empty
}

function ratingLine(rating: number) {
  const r = Math.max(1, Math.min(5, Number(rating) || 0))
  return `Оценка: ${stars(r)} (${r}/5)`
}

export default function FeedbackCard({
  token,
  item,
  onUpdate,
  strategyId,
}: {
  token: string
  item: FeedbackVm
  onUpdate: (next: FeedbackVm) => void
  strategyId?: 'A' | 'B' | 'C' | 'D'
}) {
  const { push } = useToast()
  const f = item.dto
  const productName = f.productDetails?.productName ?? 'Без названия'
  const nmId = f.productDetails?.nmId
  const rating = f.productValuation
  const hasAnswer = !!f.answer?.text
  const created = new Date(f.createdDate)

  function markAnswered() {
    try {
      window.dispatchEvent(new CustomEvent('wb:answered', { detail: { id: f.id } }))
    } catch {
      // ignore
    }
  }

  const reviewText = [f.text, f.pros ? `Плюсы: ${f.pros}` : null, f.cons ? `Минусы: ${f.cons}` : null]
    .filter(Boolean)
    .join('\n')
    .trim()

  async function sendAnswerText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      onUpdate({ ...item, sendStatus: { kind: 'error', message: 'Ответ пустой' } })
      return
    }
    if (trimmed.length < LIMITS.answerTextMin) {
      onUpdate({ ...item, sendStatus: { kind: 'error', message: `Минимум ${LIMITS.answerTextMin} символа` } })
      return
    }
    if (trimmed.length > LIMITS.answerTextMax) {
      onUpdate({ ...item, sendStatus: { kind: 'error', message: `Максимум ${LIMITS.answerTextMax} символов` } })
      return
    }

    onUpdate({ ...item, sendStatus: { kind: 'sending' }, answerDraft: trimmed })
    try {
      if (hasAnswer) {
        await editFeedbackReply(token, f.id, trimmed, strategyId)
      } else {
        await replyToFeedback(token, f.id, trimmed, strategyId)
      }
      push('✅ Ответ отправлен')
      markAnswered()
      onUpdate({
        ...item,
        sendStatus: { kind: 'sent' },
        answerDraft: trimmed,
        lastSentAnswer: trimmed,
        dto: {
          ...item.dto,
          answer: { text: trimmed, state: item.dto.answer?.state ?? 'wbRu', editable: item.dto.answer?.editable ?? false },
        },
      })
    } catch (e: any) {
      if (e instanceof WbHttpError) {
        onUpdate({
          ...item,
          sendStatus: { kind: 'error', message: e.detail ? `${e.status}: ${e.detail}` : `${e.status}: ${e.message}` },
        })
      } else {
        onUpdate({ ...item, sendStatus: { kind: 'error', message: String(e?.message ?? e) } })
      }
    }
  }

  async function copy(text: string, label = 'Скопировано') {
    try {
      await navigator.clipboard.writeText(text)
      push(label)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      push(label)
    }
  }

  async function sendAnswerDirect(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      onUpdate({ ...item, sendStatus: { kind: 'error', message: 'Ответ пустой' } })
      return
    }
    if (trimmed.length < LIMITS.answerTextMin) {
      onUpdate({ ...item, sendStatus: { kind: 'error', message: `Минимум ${LIMITS.answerTextMin} символа` } })
      return
    }
    if (trimmed.length > LIMITS.answerTextMax) {
      onUpdate({ ...item, sendStatus: { kind: 'error', message: `Максимум ${LIMITS.answerTextMax} символов` } })
      return
    }

    // Если текст совпадает с тем, что уже есть в WB — не дублируем.
    if (hasAnswer && trimmed === (f.answer?.text ?? '').trim()) {
      onUpdate({ ...item, sendStatus: { kind: 'sent' }, answerDraft: trimmed, lastSentAnswer: trimmed })
      return
    }

    onUpdate({ ...item, sendStatus: { kind: 'sending' }, answerDraft: trimmed })
    try {
      if (hasAnswer) {
        await editFeedbackReply(token, f.id, trimmed, strategyId)
      } else {
        await replyToFeedback(token, f.id, trimmed, strategyId)
      }
      push('✅ Ответ отправлен')
      markAnswered()
      onUpdate({
        ...item,
        answerDraft: trimmed,
        lastSentAnswer: trimmed,
        sendStatus: { kind: 'sent' },
        dto: {
          ...item.dto,
          answer: { text: trimmed, state: item.dto.answer?.state ?? 'wbRu', editable: item.dto.answer?.editable ?? false },
        },
      })
    } catch (e: any) {
      if (e instanceof WbHttpError) {
        onUpdate({
          ...item,
          sendStatus: { kind: 'error', message: e.detail ? `${e.status}: ${e.detail}` : `${e.status}: ${e.message}` },
        })
      } else {
        onUpdate({ ...item, sendStatus: { kind: 'error', message: String(e?.message ?? e) } })
      }
    }
  }

  const palette = React.useMemo(() => {
    const s = String(f.id)
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return ['black', 'yellow', 'white'][h % 3]
  }, [f.id])

  return (
    <div className={`card reviewCard reviewCard--${palette}`}>
      <div className="feedbackHeader">
        <div>
          <div style={{ fontWeight: 600 }}>{productName}</div>
          <div className="small muted">
            {stars(rating)} ({rating}) • {created.toLocaleString('ru-RU')}
          </div>
        </div>
        <div className="kv">
          {nmId ? <span>арт. продавца: {nmId}</span> : <span>арт. продавца: —</span>}
          <span>{hasAnswer ? 'есть ответ' : 'нет ответа'}</span>
        </div>
      </div>

      <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{reviewText || <span className="muted">(нет текста)</span>}</div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn"
          onClick={() => void copy(`Товар: ${productName}\n${ratingLine(rating)}`, 'Скопировано')}
        >
          Скопировать название
        </button>
        <button
          className="btn"
          onClick={() => void copy(`${ratingLine(rating)}\n\n${reviewText}`.trim(), 'Скопировано')}
          disabled={!reviewText}
        >
          Скопировать отзыв
        </button>
        <button
          className="btn"
          onClick={() => void copy(`Товар: ${productName}\n${ratingLine(rating)}\n\n${reviewText}`.trim(), 'Скопировано')}
          disabled={!reviewText}
        >
          Скопировать вместе
        </button>
      </div>

      <AnswerBox
        token={token}
        feedbackId={f.id}
        hasExistingAnswer={!!f.answer?.text}
        existingAnswerText={f.answer?.text ?? ''}
        strategyId={strategyId}
        value={item.answerDraft}
        onChangeValue={(v) => onUpdate({ ...item, answerDraft: v })}
        status={item.sendStatus}
        onStatus={(s) => onUpdate({ ...item, sendStatus: s })}
        onSent={(text) => {
          onUpdate({
            ...item,
            lastSentAnswer: text,
            dto: {
              ...item.dto,
              answer: { text, state: item.dto.answer?.state ?? 'wbRu', editable: item.dto.answer?.editable ?? false },
            },
          })
        }}
      />

      {hasAnswer && f.answer?.text && (
        <div className="small" style={{ marginTop: 8 }}>
          Текущий ответ в WB: <span style={{ whiteSpace: 'pre-wrap' }}>{f.answer.text}</span>
        </div>
      )}
    </div>
  )
}
