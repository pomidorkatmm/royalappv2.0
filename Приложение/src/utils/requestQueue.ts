import { WbHttpError } from '../api/wbClient'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export type QueueTask<T> = () => Promise<T>

/**
 * Последовательная очередь запросов (concurrency=1) с паузой между задачами.
 * Нужна, чтобы не ловить API лимиты и не стрелять параллельными запросами.
 */
export class RequestQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private delayMs: number

  constructor(delayMs: number) {
    this.delayMs = Math.max(0, delayMs)
  }

  setDelay(delayMs: number) {
    this.delayMs = Math.max(0, delayMs)
  }

  add<T>(task: QueueTask<T>): Promise<T> {
    const run = async () => {
      const res = await task()
      if (this.delayMs > 0) await sleep(this.delayMs)
      return res
    }
    const p = this.chain.then(run, run)
    // не даём chain «сломаться»
    this.chain = p.catch(() => undefined)
    return p
  }
}

/**
 * Retry-обёртка для действий, которые могут падать по лимитам/временным ошибкам.
 */
export async function retryable<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 4)
  const baseDelayMs = Math.max(250, opts.baseDelayMs ?? 1200)

  let attempt = 0
  while (true) {
    attempt += 1
    try {
      return await fn()
    } catch (e: any) {
      const isWb = e instanceof WbHttpError
      const status = isWb ? e.status : 0
      const retriable =
        status === 0 || status === 429 || status === 409 || (status >= 500 && status <= 599)

      if (attempt >= maxAttempts || !retriable) throw e

      // если WB вернул X-Ratelimit-Retry — wbFetch уже подождал. Здесь добавим небольшой backoff,
      // чтобы избежать повторной «волны».
      const wait = Math.min(baseDelayMs * 2 ** (attempt - 1), 12_000)
      await sleep(wait)
    }
  }
}
