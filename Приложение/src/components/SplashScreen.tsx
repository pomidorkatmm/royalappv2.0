import React, { useEffect, useMemo, useState } from 'react'

export function SplashScreen({ onDone, ms = 2000 }: { onDone: () => void; ms?: number }) {
  const line = 'расширение для Wildberries'
  const [shown, setShown] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  // typing effect
  useEffect(() => {
    const startDelay = 250
    const total = Math.max(1, ms - startDelay - 250)
    const step = Math.max(18, Math.floor(total / Math.max(1, line.length)))
    let i = 0
    const t0 = window.setTimeout(() => {
      const it = window.setInterval(() => {
        i += 1
        setShown(i)
        if (i >= line.length) window.clearInterval(it)
      }, step)
    }, startDelay)
    return () => window.clearTimeout(t0)
  }, [ms, line.length])

  useEffect(() => {
    const progressDuration = Math.max(600, ms - 600)
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const next = Math.min(100, Math.round((elapsed / progressDuration) * 100))
      setProgress(next)
      if (next >= 100) {
        setDone(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const t = window.setTimeout(onDone, ms)
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(raf)
    }
  }, [onDone, ms])

  useEffect(() => {
    if (progress >= 100) setDone(true)
  }, [progress])

  const typed = useMemo(() => line.slice(0, shown), [line, shown])

  return (
    <div className="splashRoot">
      <div className="splashCenter">
        <div className="splashTitle">ROYAL CHARMS</div>
        <div className={"splashSub " + (shown > 0 ? 'isShown' : '')}>
          {typed}
          <span className="splashCursor">▍</span>
        </div>
        <div className={`splashBar ${done ? 'isDone' : ''}`}>
          <div className="splashBarFill" style={{ width: `${progress}%` }} />
        </div>
        <div className={`splashMessage ${done ? 'isShown' : ''}`}>
          ДЕНЬГИ УЖЕ НАЧАЛИ ИДТИ К ТЕБЕ
        </div>
      </div>
    </div>
  )
}
