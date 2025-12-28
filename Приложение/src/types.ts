export type ApiResult<T> = {
  data: T
  error: boolean
  errorText: string
  additionalErrors: unknown
}

export type FeedbackAnswerDto = {
  text: string
  state: string
  editable: boolean
}

export type ProductDetailsDto = {
  imtId: number
  nmId: number
  productName: string
  supplierArticle?: string
  supplierName?: string
  brandName?: string
  size?: string
}

export type FeedbackDto = {
  id: string
  text: string | null
  pros?: string | null
  cons?: string | null
  productValuation: number
  createdDate: string
  answer: FeedbackAnswerDto | null
  state?: string
  productDetails?: ProductDetailsDto
  wasViewed?: boolean
  userName?: string
}

export type FeedbackListData = {
  countUnanswered: number
  countArchive: number
  feedbacks: FeedbackDto[]
}

export type UnseenData = {
  hasNewQuestions: boolean
  hasNewFeedbacks: boolean
}

export type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

export type FeedbackVm = {
  dto: FeedbackDto
  // то, что пользователь видит/редактирует в textarea
  answerDraft: string
  // последний успешно отправленный текст (чтобы не дублировать отправку)
  lastSentAnswer: string
  sendStatus: SendStatus
}

export type AutoReplyTextMode = 'any' | 'withText' | 'noText'

export type AutoReplyRule = {
  id: string
  enabled: boolean
  // если массив пустой — значит «любая оценка»
  ratings: number[]
  // отвечать ли только на отзывы без ответа
  onlyUnanswered: boolean
  textMode: AutoReplyTextMode
  replyText: string
}
