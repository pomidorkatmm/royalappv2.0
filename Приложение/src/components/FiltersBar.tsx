import React from 'react'

export type FiltersState = {
  answer: 'all' | 'answered' | 'unanswered'
  rating: 'all' | 1 | 2 | 3 | 4 | 5
  q: string
  daysBack: 7 | 30 | 90 | 365 | 730 | 99999
}

export default function FiltersBar({
  value,
  onChange,
  onRefresh,
  onOpenAutoReplies,
  loading,
}: {
  value: FiltersState
  onChange: (next: FiltersState) => void
  onRefresh: () => void
  onOpenAutoReplies: () => void
  loading: boolean
}) {
  return (
    <div className="filtersBar" style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="filtersLabel">
          Статус
          <select
            className="select"
            value={value.answer}
            onChange={(e) => onChange({ ...value, answer: e.target.value as any })}
            style={{ marginLeft: 6 }}
          >
            <option value="all">все</option>
            <option value="unanswered">без ответа</option>
            <option value="answered">с ответом</option>
          </select>
        </label>

        <label className="filtersLabel">
          Оценка
          <select
            className="select"
            value={value.rating}
            onChange={(e) => {
              const v = e.target.value
              onChange({ ...value, rating: v === 'all' ? 'all' : (Number(v) as any) })
            }}
            style={{ marginLeft: 6 }}
          >
            <option value="all">все</option>
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1</option>
          </select>
        </label>

        <label className="filtersLabel">
          Период
          <select
            className="select"
            value={value.daysBack}
            onChange={(e) => onChange({ ...value, daysBack: Number(e.target.value) as any })}
            style={{ marginLeft: 6 }}
          >
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
            <option value={365}>год</option>
            <option value={730}>2 года</option>
            <option value={99999}>за все время</option>
          </select>
        </label>

        <input
          className="input"
          style={{ width: 'min(420px, 90vw)' }}
          placeholder="Поиск по названию/тексту…"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
        />

        <button className="btn" onClick={onOpenAutoReplies} title="Правила автоответов">
          Автоответы
        </button>
        <button className="btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>
      <div className="small" style={{ marginTop: 8, color: '#fff' }}>
        Сортировка: новые сверху (dateDesc)
      </div>
    </div>
  )
}
