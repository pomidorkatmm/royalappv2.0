/**
 * Здесь собраны все эндпоинты WB, чтобы их было легко менять.
 *
 * Используем прямые домены WB API, как в официальной документации.
 */

export const WB_PROXY_BASE = 'https://feedbacks-api.wildberries.ru'
export const WB_PROXY_BASE_ALT = 'https://feedbacks-api.wb.ru'

// Домены WB API для A/B-тестов и других модулей
export const WB_PROXY_ADS = 'https://advert-api.wildberries.ru'
// Альтернативный домен Ads API (у части кабинетов встречается wb.ru)
export const WB_PROXY_ADS_ALT = 'https://advert-api.wb.ru'
// WB Media ads API (отдельный домен)
export const WB_PROXY_ADS_MEDIA = 'https://advert-media-api.wildberries.ru'
export const WB_PROXY_ADS_MEDIA_ALT = 'https://advert-media-api.wb.ru'
// Общие методы (general): seller-info, новости и т.п.
export const WB_PROXY_COMMON = 'https://common-api.wildberries.ru'
export const WB_PROXY_COMMON_ALT = 'https://common-api.wb.ru'
export const WB_PROXY_CONTENT = 'https://content-api.wildberries.ru'
export const WB_PROXY_CONTENT_ALT = 'https://content-api.wb.ru'
export const WB_PROXY_PRICES = 'https://discounts-prices-api.wildberries.ru'
export const WB_PROXY_PRICES_ALT = 'https://discounts-prices-api.wb.ru'
export const WB_PROXY_SUPPLIERS = 'https://suppliers-api.wildberries.ru'
export const WB_PROXY_SUPPLIERS_ALT = 'https://suppliers-api.wb.ru'
export const WB_PROXY_MARKETPLACE = 'https://marketplace-api.wildberries.ru'
export const WB_PROXY_MARKETPLACE_ALT = 'https://marketplace-api.wb.ru'
export const WB_PROXY_STATISTICS = 'https://statistics-api.wildberries.ru'
export const WB_PROXY_STATISTICS_ALT = 'https://statistics-api.wb.ru'
export const WB_PROXY_FINANCE = 'https://finance-api.wildberries.ru'
export const WB_PROXY_FINANCE_ALT = 'https://finance-api.wb.ru'
export const WB_PROXY_ANALYTICS = 'https://analytics-api.wildberries.ru'
export const WB_PROXY_ANALYTICS_ALT = 'https://analytics-api.wb.ru'
export const WB_PROXY_PROMOTION = 'https://promotion-api.wildberries.ru'
export const WB_PROXY_PROMOTION_ALT = 'https://promotion-api.wb.ru'
export const WB_PROXY_CHAT = 'https://chat-api.wildberries.ru'
export const WB_PROXY_CHAT_ALT = 'https://chat-api.wb.ru'
export const WB_PROXY_SUPPLIES = 'https://suppliers-api.wildberries.ru'
export const WB_PROXY_SUPPLIES_ALT = 'https://suppliers-api.wb.ru'
export const WB_PROXY_RETURNS = 'https://suppliers-api.wildberries.ru'
export const WB_PROXY_RETURNS_ALT = 'https://suppliers-api.wb.ru'
export const WB_PROXY_DOCUMENTS = 'https://suppliers-api.wildberries.ru'
export const WB_PROXY_DOCUMENTS_ALT = 'https://suppliers-api.wb.ru'

export const WB_ENDPOINTS = {
  // Проверка токена делается через реальные «рабочие» методы (см. api/wbClient.ts)

  // Список отзывов
  feedbacksList: '/api/v1/feedbacks',

  // Ответ на отзыв (POST) / редактирование ответа (PATCH)
  feedbackAnswer: '/api/v1/feedbacks/answer',
} as const

// A/B тесты (Marketing/Promotion, Content, Prices&Discounts)
export const WB_ADS_ENDPOINTS = {
  // Список кампаний (id) — самый надёжный метод, используем его как первичный
  campaignsCount: '/adv/v1/promotion/count',
  // Информация о кампаниях (по списку IDs, до 50 за запрос)
  // Документация: /adv/v1/promotion/adverts (POST, body = [id, id, ...])
  campaignsInfo: '/adv/v1/promotion/adverts',
  fullStats: '/adv/v3/fullstats',
  // Управление активностью кампаний
  campaignStart: '/adv/v0/start',
  campaignPause: '/adv/v0/pause',
  campaignStop: '/adv/v0/stop',
} as const

export const WB_ADS_MEDIA_ENDPOINTS = {
  // Media кампании (отдельный домен advert-media-api)
  count: '/adv/v1/count',
  list: '/adv/v1/adverts',
  info: '/adv/v1/advert',
} as const

export const WB_COMMON_ENDPOINTS = {
  sellerInfo: '/api/v1/seller-info',
} as const

export const WB_CONTENT_ENDPOINTS = {
  cardsList: '/content/v2/get/cards/list',
  cardsLimits: '/content/v2/cards/limits',
  uploadMediaFile: '/content/v3/media/file',
  mediaSave: '/content/v3/media/save',
} as const

export const WB_PRICES_ENDPOINTS = {
  listGoodsFilter: '/api/v2/list/goods/filter',
  uploadTask: '/api/v2/upload/task',
} as const

export const LIMITS = {
  // По документации WB: 2..5000 символов
  answerTextMin: 2,
  answerTextMax: 5000,
  // По документации WB: take max 5000
  feedbacksTakeMax: 5000,
} as const

export const DEFAULTS = {
  // Чтобы не грузить «всю историю», по умолчанию берем последние 90 дней.
  daysBack: 90,
  autoRefreshMs: 60_000,
  typingDebounceMs: 1500,
  // Пауза между автоответами, чтобы не ловить 429/409
  autoReplyDelayMs: 2500,
  // Пауза между запросами к Ads API (календарь рекламы)
  adsQueueDelayMs: 2500,
} as const


export const STORAGE_KEYS = {
  // Токен для: отзывы/вопросы, контент, цены/скидки
  sellerApiKey: 'wb_api_key_seller',
  // Отдельный токен для WB Ads (Promotion)
  adsApiKey: 'wb_api_key_ads',
  // legacy (старые версии приложения)
  apiKeyLegacy: 'wb_api_key',
  autoReplyRules: 'wb_auto_reply_rules_v1',
  abTests: 'wb_ab_tests_v1',

  // Аккаунты/магазины
  accounts: 'wb_accounts_v1',
  activeAccountId: 'wb_active_account_id_v1',

  // Настройки
  autoRefreshMs: 'wb_auto_refresh_ms_v1',

  // Счетчик «отвечено через приложение»
  answeredIds: 'wb_answered_ids_v1',

  // Календарь рекламы (по аккаунту и кампании)
  adsSchedules: 'wb_ads_schedules_v1',

  // Unit экономика (по аккаунту)
  unitEconomy: 'wb_unit_economy_v1',
  // OpenAPI стратегия (по аккаунту)
  openApiStrategy: 'wb_openapi_strategy_v1',
} as const

// Текст можно использовать как пример для правил автоответов
export const AUTO_REPLY_TEMPLATE_EXAMPLE =
  'Спасибо за высокую оценку и ваш выбор. Нам очень приятно, что товар вам понравился и оправдал ожидания.\n\n' +
  'Мы стараемся уделять внимание качеству, упаковке и удобству использования, чтобы покупка приносила положительные эмоции. ' +
  'Благодарим за доверие и будем рады видеть вас снова среди наших покупателей.'
