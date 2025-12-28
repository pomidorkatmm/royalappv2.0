import { DEFAULTS, LIMITS, WB_ENDPOINTS } from '../config'
import type { ApiResult, FeedbackListData } from '../types'
import { openApiFetch, type OpenApiStrategyId } from './wbOpenApiClient'

export class WbHttpError extends Error {
  status: number
  detail?: string
  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'WbHttpError'
    this.status = status
    this.detail = detail
  }
}

export function isAuthError(err: unknown) {
  return err instanceof WbHttpError && (err.status === 401 || err.status === 403)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function validateToken(token: string, strategyId?: OpenApiStrategyId) {
  // Лёгкий запрос через «реальный» рабочий метод.
  // Если токен/категория недоступны — WB вернет 401/403.
  const r = await openApiFetch<ApiResult<FeedbackListData>>(token, 'feedbacks', WB_ENDPOINTS.feedbacksList, {
    query: {
      isAnswered: false,
      take: 1,
      skip: 0,
      order: 'dateDesc',
    },
  }, strategyId)
  if ((r as any)?.error) throw new WbHttpError(400, 'WB API: ошибка', (r as any).errorText)
  return r
}

export async function listFeedbacks(
  token: string,
  args: {
    isAnswered: boolean
    take?: number
    skip?: number
    order?: 'dateAsc' | 'dateDesc'
    dateFrom?: number
    dateTo?: number
    nmId?: number
  },
  strategyId?: OpenApiStrategyId,
) {
  const take = Math.min(args.take ?? LIMITS.feedbacksTakeMax, LIMITS.feedbacksTakeMax)
  const r = await openApiFetch<ApiResult<FeedbackListData>>(token, 'feedbacks', WB_ENDPOINTS.feedbacksList, {
    query: {
      isAnswered: args.isAnswered,
      take,
      skip: args.skip ?? 0,
      order: args.order ?? 'dateDesc',
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      nmId: args.nmId,
    },
  }, strategyId)
  if ((r as any)?.error) {
    throw new WbHttpError(400, 'WB API: ошибка', (r as any).errorText)
  }
  return r
}

export async function replyToFeedback(token: string, id: string, text: string, strategyId?: OpenApiStrategyId) {
  const trimmed = text.trim()
  if (trimmed.length < LIMITS.answerTextMin) {
    throw new Error(`Ответ слишком короткий (мин. ${LIMITS.answerTextMin} символа)`) // локальная валидация
  }
  if (trimmed.length > LIMITS.answerTextMax) {
    throw new Error(`Ответ слишком длинный (макс. ${LIMITS.answerTextMax} символов)`) // локальная валидация
  }

  await openApiFetch<void>(token, 'feedbacks', WB_ENDPOINTS.feedbackAnswer, {
    method: 'POST',
    body: { id, text: trimmed },
  }, strategyId)
}

export async function editFeedbackReply(token: string, id: string, text: string, strategyId?: OpenApiStrategyId) {
  const trimmed = text.trim()
  if (trimmed.length < LIMITS.answerTextMin) {
    throw new Error(`Ответ слишком короткий (мин. ${LIMITS.answerTextMin} символа)`) // локальная валидация
  }
  if (trimmed.length > LIMITS.answerTextMax) {
    throw new Error(`Ответ слишком длинный (макс. ${LIMITS.answerTextMax} символов)`) // локальная валидация
  }

  await openApiFetch<void>(token, 'feedbacks', WB_ENDPOINTS.feedbackAnswer, {
    method: 'PATCH',
    body: { id, text: trimmed },
  }, strategyId)
}

export function unixSecondsDaysBack(daysBack: number) {
  const now = Date.now()
  const from = daysBack >= 99999 ? 0 : now - daysBack * 24 * 60 * 60 * 1000
  return {
    dateFrom: Math.floor(from / 1000),
    dateTo: Math.floor(now / 1000),
  }
}

export async function safeReloadBoth(
  token: string,
  params: { dateFrom: number; dateTo: number; take?: number },
  strategyId?: OpenApiStrategyId,
) {
  // Лимит категории feedbacks/questions: 3 запроса/сек.
  // Делаем 2 запроса подряд с небольшой паузой.
  const first = await listFeedbacks(token, { isAnswered: false, ...params, order: 'dateDesc' }, strategyId)
  await sleep(350)
  const second = await listFeedbacks(token, { isAnswered: true, ...params, order: 'dateDesc' }, strategyId)
  return { unanswered: first, answered: second }
}
