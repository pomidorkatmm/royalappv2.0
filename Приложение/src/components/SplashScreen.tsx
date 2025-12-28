import React, { useEffect, useMemo, useState } from 'react'

export function SplashScreen({ onDone, ms = 2000 }: { onDone: () => void; ms?: number }) {
  const line = 'расширение для Wildberries'
  const [shown, setShown] = useState(0)

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
    const t = window.setTimeout(onDone, ms)
    return () => window.clearTimeout(t)
  }, [onDone, ms])

  const typed = useMemo(() => line.slice(0, shown), [line, shown])

  return (
    <div className="splashRoot">
      <div className="splashCenter">
        <div className="splashTitle">ROYAL CHARMS</div>
        <div className={"splashSub " + (shown > 0 ? 'isShown' : '')}>
          {typed}
          <span className="splashCursor">▍</span>
        </div>
      </div>
    </div>
  )
}
