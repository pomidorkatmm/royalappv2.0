import { useEffect, useMemo, useRef } from 'react'

export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
) {
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const timer = useRef<number | null>(null)

  const api = useMemo(() => {
    const cancel = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }

    const call = (...args: TArgs) => {
      cancel()
      timer.current = window.setTimeout(() => fnRef.current(...args), delayMs)
    }

    return { call, cancel }
  }, [delayMs])

  // cleanup
  useEffect(() => api.cancel, [api])

  return api
}
