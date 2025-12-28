import { WB_CONTENT_ENDPOINTS } from '../config'
import { openApiFetch, type OpenApiStrategyId } from './wbOpenApiClient'

export type WbCard = any

export type CardsListCursor = {
  updatedAt?: string
  nmID?: number
  nmId?: number
  limit?: number
  total?: number
}

export type CardShort = {
  nmId: number
  vendorCode?: string
  title?: string
  hasPhoto?: boolean
}

export async function listCardsPage(
  token: string,
  args: {
    cursor?: { updatedAt?: string; nmId?: number }
    limit?: number
    withPhoto?: -1 | 0 | 1
    textSearch?: string
  } = {},
  strategyId?: OpenApiStrategyId,
): Promise<{ cards: any[]; cursor?: CardsListCursor }> {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 100)
  const body: any = {
    settings: {
      cursor: {
        limit,
      },
      filter: {
        withPhoto: args.withPhoto ?? -1,
      },
    },
  }

  if (args.textSearch && args.textSearch.trim()) {
    body.settings.filter.textSearch = args.textSearch.trim()
  }

  if (args.cursor?.updatedAt) body.settings.cursor.updatedAt = args.cursor.updatedAt
  if (args.cursor?.nmId) body.settings.cursor.nmID = args.cursor.nmId

  const r = await openApiFetch<any>(token.trim(), 'content', WB_CONTENT_ENDPOINTS.cardsList, { method: 'POST', body }, strategyId)

  const cards: any[] = r?.cards ?? r?.data?.cards ?? []
  const cursor: CardsListCursor | undefined = r?.cursor ?? r?.data?.cursor
  return { cards, cursor }
}

export function toCardShort(card: any): CardShort | null {
  const nmId = Number(card?.nmID ?? card?.nmId)
  if (!Number.isFinite(nmId) || nmId <= 0) return null
  const vendorCode = String(card?.vendorCode ?? card?.supplierArticle ?? '').trim() || undefined
  const title = String(card?.title ?? card?.name ?? card?.objectName ?? card?.subjectName ?? '').trim() || undefined
  const photos = Array.isArray(card?.photos) ? card.photos : []
  const hasPhoto = photos.length > 0
  return { nmId, vendorCode, title, hasPhoto }
}

export async function getCardByNmId(token: string, nmId: number, strategyId?: OpenApiStrategyId) {
  // По документации: POST /content/v2/get/cards/list
  // В фильтре используем textSearch = nmId как строку
  const body = {
    settings: {
      cursor: { limit: 100 },
      filter: {
        textSearch: String(nmId),
        withPhoto: -1,
      },
    },
  }

  const r = await openApiFetch<any>(token.trim(), 'content', WB_CONTENT_ENDPOINTS.cardsList, { method: 'POST', body }, strategyId)

  const cards: any[] = r?.cards ?? r?.data?.cards ?? []
  const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId)
  return { raw: r, card }
}

/**
 * Найти карточку по артикулу продавца (vendorCode / supplierArticle).
 * WB допускает textSearch по строке: часто работает и для vendorCode.
 */
export async function getCardByVendorCode(token: string, vendorCode: string, strategyId?: OpenApiStrategyId) {
  const body = {
    settings: {
      cursor: { limit: 100 },
      filter: {
        textSearch: vendorCode,
        withPhoto: -1,
      },
    },
  }

  const r = await openApiFetch<any>(token.trim(), 'content', WB_CONTENT_ENDPOINTS.cardsList, { method: 'POST', body }, strategyId)

  const cards: any[] = r?.cards ?? r?.data?.cards ?? []
  const norm = vendorCode.trim().toLowerCase()
  const pick =
    cards.find((c) => String(c?.vendorCode ?? c?.supplierArticle ?? '').trim().toLowerCase() === norm) ??
    cards[0] ??
    null

  const nmId = Number(pick?.nmID ?? pick?.nmId)
  return { raw: r, card: pick, nmId: Number.isFinite(nmId) ? nmId : NaN }
}

export function getBigPhotoUrls(card: any): string[] {
  const photos: any[] = card?.photos ?? []
  return photos.map((p) => p?.big).filter(Boolean)
}

export async function uploadMediaFile(
  token: string,
  args: { nmId: number; photoNumber: number; file: File },
  strategyId?: OpenApiStrategyId,
) {
  const fd = new FormData()
  fd.append('uploadfile', args.file)

  return openApiFetch<any>(token, 'content', WB_CONTENT_ENDPOINTS.uploadMediaFile, {
    method: 'POST',
    formData: fd,
    headers: {
      'X-Nm-Id': String(args.nmId),
      'X-Photo-Number': String(args.photoNumber),
    },
  }, strategyId)
}

export async function saveMediaOrder(token: string, args: { nmId: number; urls: string[] }, strategyId?: OpenApiStrategyId) {
  // New media files (`data`) replace old ones
  return openApiFetch<any>(token, 'content', WB_CONTENT_ENDPOINTS.mediaSave, {
    method: 'POST',
    body: {
      nmId: args.nmId,
      data: args.urls,
    },
  }, strategyId)
}

export function reorderUrlsKeepAll(urls: string[], coverUrl: string): string[] {
  const uniq: string[] = []
  const seen = new Set<string>()

  const push = (u: string) => {
    if (!u) return
    if (seen.has(u)) return
    seen.add(u)
    uniq.push(u)
  }

  push(coverUrl)
  for (const u of urls) push(u)
  return uniq
}

export function guessUrlByPhotoNumber(urls: string[], photoNumber: number) {
  // Обычно WB хранит .../images/big/<N>.webp
  const needle = `/big/${photoNumber}.`
  return urls.find((u) => u.includes(needle))
}

/** Лёгкая проверка доступа к Content API (нужна категория Content). */
export async function checkContentAccess(token: string, strategyId?: OpenApiStrategyId): Promise<boolean> {
  await openApiFetch<any>(token.trim(), 'content', WB_CONTENT_ENDPOINTS.cardsLimits, { method: 'GET' }, strategyId)
  return true
}
