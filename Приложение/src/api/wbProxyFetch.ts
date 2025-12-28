import { WbHttpError } from './wbClient'

function buildUrl(
  base: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
) {
  const u = new URL(base + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      u.searchParams.set(k, String(v))
    }
  }
  return u.toString()
}

async function parseMaybeJson(res: Response): Promise<any> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Унифицированный запрос к WB API через прямые домены.
 */
export async function wbProxyFetch<T>(
  token: string,
  base: string,
  path: string,
  opts: {
    method?: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: any
    formData?: FormData
    headers?: Record<string, string>
    /**
     * Как формировать заголовок Authorization.
     * - raw: передавать токен как есть (как в suppliers-api)
     * - bearer: передавать "Bearer <token>"
     * - auto: сначала raw, затем bearer
     */
    authMode?: 'raw' | 'bearer' | 'auto'
  } = {},
): Promise<T> {
  const { method = 'GET', query, body, formData, headers = {}, authMode = 'raw' } = opts
  const url = buildUrl(base, path, query)

  const cleanToken = token.trim()
  const authRaw = cleanToken
  const authBearer = cleanToken.toLowerCase().startsWith('bearer ') ? cleanToken : `Bearer ${cleanToken}`

  const authCandidates: string[] =
    authMode === 'bearer' ? [authBearer] : authMode === 'auto' ? [authRaw, authBearer] : [authRaw]

  let lastError: unknown = null
  for (const authHeaderValue of authCandidates) {
    const reqHeaders: Record<string, string> = {
      Authorization: authHeaderValue,
      ...headers,
    }

    if (body !== undefined && !formData) {
      reqHeaders['Content-Type'] = 'application/json'
    }

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: formData ? formData : body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e: any) {
      lastError = e
      continue
    }

    if (res.status === 204) {
      return null as T
    }

    if (!res.ok) {
      const payload = await parseMaybeJson(res)
      const detail = payload?.detail || payload?.errorText || payload?.message

      if (authMode === 'auto' && res.status === 401) {
        lastError = new WbHttpError(res.status, res.statusText || 'Ошибка WB API', detail)
        continue
      }

      throw new WbHttpError(res.status, res.statusText || 'Ошибка WB API', detail)
    }

    const payload = (await parseMaybeJson(res)) as T
    return payload
  }

  if (lastError instanceof WbHttpError) {
    throw lastError
  }
  throw new WbHttpError(401, 'Unauthorized', 'Не удалось авторизоваться в WB API (проверьте токен)')
}
