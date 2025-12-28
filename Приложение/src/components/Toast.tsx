import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastItem = { id: string; text: string }

const ToastCtx = createContext<{ push: (text: string) => void } | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((text: string) => {
    const id = Math.random().toString(16).slice(2)
    const it = { id, text }
    setItems((prev) => [it, ...prev].slice(0, 5))
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id))
    }, 1500)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toastWrap">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
