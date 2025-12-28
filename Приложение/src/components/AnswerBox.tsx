import React, { useEffect, useMemo, useState } from 'react'
import { DEFAULTS, LIMITS } from '../config'
import { editFeedbackReply, replyToFeedback, WbHttpError } from '../api/wbClient'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import type { SendStatus } from '../types'

export default function AnswerBox({
  token,
  feedbackId,
  hasExistingAnswer,
  existingAnswerText,
  strategyId,
  value,
  onChangeValue,
  status,
  onStatus,
  onSent,
}: {
  token: string
  feedbackId: string
  hasExistingAnswer: boolean
  existingAnswerText: string
  strategyId?: 'A' | 'B' | 'C' | 'D'
  value: string
  onChangeValue: (v: string) => void
  status: SendStatus
  onStatus: (s: SendStatus) => void
  onSent: (text: string) => void
}) {
  const canSend = useMemo(() => value.trim().length >= LIMITS.answerTextMin, [value])

  const send = async (text: string, immediate: boolean) => {
    const trimmed = text.trim()
    if (!trimmed) {
      onStatus({ kind: 'error', message: 'Ответ пустой' })
      return
    }
    if (trimmed.length < LIMITS.answerTextMin) {
      onStatus({ kind: 'error', message: `Минимум ${LIMITS.answerTextMin} символа` })
      return
    }
    if (trimmed.length > LIMITS.answerTextMax) {
      onStatus({ kind: 'error', message: `Максимум ${LIMITS.answerTextMax} символов` })
      return
    }

    // Если текст совпадает с тем, что уже есть в WB — не дублируем.
    if (hasExistingAnswer && trimmed === existingAnswerText.trim()) {
      onStatus({ kind: 'sent' })
      return
    }

    onStatus({ kind: 'sending' })
    try {
      if (hasExistingAnswer) {
        await editFeedbackReply(token, feedbackId, trimmed, strategyId)
      } else {
        await replyToFeedback(token, feedbackId, trimmed, strategyId)
      }
      onStatus({ kind: 'sent' })
      onSent(trimmed)
    } catch (e: any) {
      if (e instanceof WbHttpError) {
        onStatus({ kind: 'error', message: e.detail ? `${e.status}: ${e.detail}` : `${e.status}: ${e.message}` })
      } else {
        onStatus({ kind: 'error', message: String(e?.message ?? e) })
      }
    }
  }

  const debounced = useDebouncedCallback(() => {
    if (!canSend) return
    void send(value, false)
  }, DEFAULTS.typingDebounceMs)

  // Если есть ответ и он пришёл с сервера — синхронизируем поле, но не мешаем ручному вводу.
  useEffect(() => {
    if (hasExistingAnswer && existingAnswerText && value.trim() === '') {
      onChangeValue(existingAnswerText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExistingAnswer, existingAnswerText])

  const statusText =
    status.kind === 'sending'
      ? 'Отправляется…'
      : status.kind === 'sent'
        ? '✅ Отправлено'
        : status.kind === 'error'
          ? `❌ Ошибка: ${status.message}`
          : ''

  return (
    <div style={{ marginTop: 10 }}>
      <div className="small" style={{ marginBottom: 6 }}>
        Ответ на отзыв
      </div>

      <textarea
        className="textarea"
        value={value}
        placeholder="Вставьте ответ сюда (вставка отправится сразу)…"
        onChange={(e) => {
          onChangeValue(e.target.value)
          debounced.call()
        }}
        onBlur={() => {
          // если человек печатал — отправим при уходе с поля
          if (canSend) void send(value, false)
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text')
          // даём вставиться, затем мгновенная отправка
          requestAnimationFrame(() => {
            onChangeValue(pasted)
            void send(pasted, true)
          })
        }}
      />

      <div className="answerStatus" aria-live="polite">
        {statusText && <span>{statusText}</span>}
        <span className="muted" style={{ marginLeft: 10 }}>
          Лимит WB: {LIMITS.answerTextMin}–{LIMITS.answerTextMax} символов
        </span>
      </div>
    </div>
  )
}
