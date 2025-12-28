import React from 'react'
import type { FeedbackVm } from '../types'
import FeedbackCard from './FeedbackCard'

export default function FeedbackList({
  token,
  items,
  onUpdateItem,
  strategyId,
}: {
  token: string
  items: FeedbackVm[]
  onUpdateItem: (id: string, next: FeedbackVm) => void
  strategyId?: 'A' | 'B' | 'C' | 'D'
}) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div style={{ fontWeight: 600 }}>Нет отзывов по текущим фильтрам</div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Попробуйте изменить период/фильтры и нажать «Обновить».
        </div>
      </div>
    )
  }

  return (
    <div className="list">
      {items.map((it) => (
        <FeedbackCard
          key={it.dto.id}
          token={token}
          item={it}
          strategyId={strategyId}
          onUpdate={(next) => onUpdateItem(it.dto.id, next)}
        />
      ))}
    </div>
  )
}
