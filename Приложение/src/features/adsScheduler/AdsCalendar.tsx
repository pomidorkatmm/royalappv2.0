import React, { useMemo, useRef, useState } from 'react'
import type { AdsSchedule } from './adsScheduleStorage'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export default function AdsCalendar({
  schedule,
  onChange,
  currentDayIndex,
  currentHour,
}: {
  schedule: AdsSchedule
  onChange: (next: AdsSchedule) => void
  currentDayIndex: number
  currentHour: number
}) {
  const [drag, setDrag] = useState<{ active: boolean; mode: 'on' | 'off' } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  const applyCell = (d: number, h: number, v: boolean) => {
    if (!!schedule[d]?.[h] === v) return
    onChange({ ...schedule, [d]: { ...schedule[d], [h]: v } })
  }

  const onCellDown = (d: number, h: number) => {
    const nextV = !schedule[d][h]
    onChange({ ...schedule, [d]: { ...schedule[d], [h]: nextV } })
    setDrag({ active: true, mode: nextV ? 'on' : 'off' })
  }

  const onCellEnter = (d: number, h: number) => {
    if (!drag?.active) return
    applyCell(d, h, drag.mode === 'on')
  }

  // stop drag on global mouseup
  React.useEffect(() => {
    const up = () => setDrag(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  return (
    <div ref={rootRef} className="adsCalendar">
      <div className="adsCalendarGrid">
        <div className="adsCalendarCorner" />
        {hours.map((h) => (
          <div key={h} className={cls('adsCalendarHour', h === currentHour && 'isCurrentHour')}>
            {String(h).padStart(2, '0')}:00
          </div>
        ))}

        {DAYS.map((label, d) => (
          <React.Fragment key={d}>
            <div className={cls('adsCalendarDay', d === currentDayIndex && 'isToday')}>{label}</div>
            {hours.map((h) => {
              const isOn = !!schedule?.[d]?.[h]
              return (
                <div
                  key={`${d}-${h}`}
                  className={cls(
                    'adsCell',
                    isOn && 'isOn',
                    !isOn && 'isOff',
                    d === currentDayIndex && h === currentHour && 'isNow',
                  )}
                  onMouseDown={() => onCellDown(d, h)}
                  onMouseEnter={() => onCellEnter(d, h)}
                  title={`${label} ${String(h).padStart(2, '0')}:00`}
                />
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        ⬛ включено • ⬜ выключено • можно тянуть мышью для массового выбора
      </div>
    </div>
  )
}
