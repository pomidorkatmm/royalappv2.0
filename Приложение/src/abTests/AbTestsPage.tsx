import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import {
  listAdsCampaignIds,
  getAdsCampaignsInfoByIds,
  extractNmIdsFromCampaign,
} from '../api/wbAdsClient'
import { getCardByNmId, getBigPhotoUrls, guessUrlByPhotoNumber, uploadMediaFile, listCardsPage, toCardShort, type CardShort } from '../api/wbContentClient'
import { getCurrentPrice } from '../api/wbPricesClient'
import { applyVariant, ctr, diffTotals, fetchTotalsFromAds, restoreBaseline } from './runner'
import type { OpenApiStrategyId } from '../api/wbOpenApiClient'
import type { AbTest, AbVariant } from './types'
import { loadAbTests, upsertAbTest } from './storage'

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export default function AbTestsPage({
  sellerToken,
  adsToken,
  openApiStrategyId,
}: {
  sellerToken: string
  adsToken: string | null
  openApiStrategyId?: OpenApiStrategyId
}) {
  const { push } = useToast()

  // Список товаров (карточек) и выбор товара пользователем
  const [products, setProducts] = useState<CardShort[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState('')
  const [productsCursor, setProductsCursor] = useState<{ updatedAt?: string; nmId?: number } | null>(null)
  const [productsHasMore, setProductsHasMore] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<CardShort | null>(null)
  const [testName, setTestName] = useState('')

  const didInitialProductsLoad = useRef(false)

  const nmId = selectedProduct?.nmId ?? NaN

  const [type, setType] = useState<'photo' | 'price'>('photo')
  const [slotMinutes, setSlotMinutes] = useState(60)

  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [campaignsError, setCampaignsError] = useState('')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [campaignIdsSelected, setCampaignIdsSelected] = useState<number[]>([])

  const [photosBaseline, setPhotosBaseline] = useState<string[] | null>(null)
  const [photosAll, setPhotosAll] = useState<string[] | null>(null)
  const [photoVariants, setPhotoVariants] = useState<AbVariant[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  const [baselinePrice, setBaselinePrice] = useState<{ price: number; discount: number } | null>(null)
  const [priceVariants, setPriceVariants] = useState<number[]>([0, 0])

  const [tests, setTests] = useState<AbTest[]>(() => loadAbTests())
  const [activeId, setActiveId] = useState<string | null>(() => {
    const t = loadAbTests().find((x) => x.status === 'running')
    return t?.id ?? null
  })
  const [selectedTestId, setSelectedTestId] = useState<string | null>(() => {
    const t = loadAbTests().find((x) => x.status === 'running') ?? loadAbTests()[0]
    return t?.id ?? null
  })

  const activeTest = useMemo(() => tests.find((t) => t.id === activeId) ?? null, [tests, activeId])
  const selectedTest = useMemo(() => tests.find((t) => t.id === selectedTestId) ?? null, [tests, selectedTestId])

  // обновляем локально сохранённые тесты
  useEffect(() => {
    // persist
    // (через upsert мы уже сохраняем; здесь просто синхронизируем UI)
  }, [tests])

  useEffect(() => {
    if (selectedTestId && tests.some((t) => t.id === selectedTestId)) return
    const fallback = tests.find((t) => t.status === 'running') ?? tests[0] ?? null
    setSelectedTestId(fallback?.id ?? null)
  }, [tests, selectedTestId])

  const intervalRef = useRef<number | null>(null)

  function ensureTestName(): string {
    const trimmed = testName.trim()
    if (trimmed) return trimmed
    const fallback = selectedProduct?.vendorCode ?? (Number.isFinite(nmId) ? String(nmId) : '')
    return fallback ? `A/B тест ${fallback}` : 'A/B тест'
  }

  function isPriceAlreadySetError(e: any) {
    const msg = String(e?.detail ?? e?.message ?? e)
    return msg.includes('prices and discounts are already set')
  }

  async function loadProductsPage(reset: boolean) {
    setProductsLoading(true)
    setProductsError('')
    try {
      const limit = 100
      const cursor = reset ? undefined : productsCursor ?? undefined
      const { cards, cursor: next } = await listCardsPage(
        sellerToken,
        {
          limit,
          cursor,
          withPhoto: -1,
        },
        openApiStrategyId,
      )

      const shorts = cards.map(toCardShort).filter(Boolean) as CardShort[]
      setProducts((prev) => {
        const map = new Map<number, CardShort>()
        for (const p of reset ? [] : prev) map.set(p.nmId, p)
        for (const p of shorts) map.set(p.nmId, p)
        return Array.from(map.values()).sort((a, b) => a.nmId - b.nmId)
      })

      const nextNmId = Number((next as any)?.nmID ?? (next as any)?.nmId)
      setProductsCursor(
        next?.updatedAt || Number.isFinite(nextNmId)
          ? { updatedAt: next?.updatedAt, nmId: Number.isFinite(nextNmId) ? nextNmId : undefined }
          : null,
      )

      const returned = Number(next?.total ?? shorts.length)
      setProductsHasMore(returned >= limit && shorts.length > 0)
      if (reset && shorts.length === 0) push('Список товаров пуст')
    } catch (e: any) {
      const status = e?.status ? `HTTP ${e.status}` : ''
      const detail = e?.detail ?? e?.message ?? e
      const raw = `${status} ${String(detail)}`.trim()
      // WB иногда возвращает 404 "Please consult .../api-information" при неверном эндпоинте
      // или при отсутствии доступа к категории токена.
      if (String(detail).includes('api-information')) {
        setProductsError(
          `${raw}\n\nПохоже, у токена нет доступа к категории «Контент» (Content API) или WB вернул маршрут как недоступный.\nОткройте «API токены» и укажите токен с правами на «Работа с товарами / Контент».`,
        )
      } else {
        setProductsError(raw)
      }
    } finally {
      setProductsLoading(false)
    }
  }

  // Автозагрузка первой страницы карточек при открытии вкладки
  useEffect(() => {
    if (!sellerToken) return
    if (didInitialProductsLoad.current) return
    didInitialProductsLoad.current = true
    void loadProductsPage(true)
  }, [sellerToken])

  function onSelectProduct(p: CardShort) {
    setSelectedProduct(p)
    // сбрасываем состояния, завязанные на конкретный товар
    setCampaigns([])
    setCampaignIdsSelected([])
    setCampaignsError('')
    setPhotosBaseline(null)
    setPhotosAll(null)
    setPhotoVariants([])
    setBaselinePrice(null)
    setPriceVariants([0, 0])
    setTestName(p.vendorCode ? `A/B тест ${p.vendorCode}` : `A/B тест ${p.nmId}`)
  }

  async function loadCampaigns() {
    if (!adsToken) {
      push('Нужен токен WB Ads (Promotion)')
      return
    }

    if (!selectedProduct || !Number.isFinite(nmId) || nmId <= 0) {
      push('Сначала подтяните список товаров и выберите товар')
      return
    }
    const actualNmId = nmId
    setCampaignsLoading(true)
    setCampaignsError('')
    try {
      // 1) Самый стабильный способ: сначала берём список id кампаний
      const ids = await listAdsCampaignIds(adsToken)

      // 2) Затем подтягиваем детальную информацию по этим ids
      // Актуальный endpoint: POST /adv/v1/promotion/adverts
      const arr = await getAdsCampaignsInfoByIds(adsToken, ids)
      setCampaigns(arr)

      // авто-выбор: кампании где встречается nmId
      const matched: number[] = []
      for (const c of arr) {
        const ids = extractNmIdsFromCampaign(c)
        if (ids.includes(actualNmId)) {
          const cid = Number(c?.advertId ?? c?.id)
          if (Number.isFinite(cid)) matched.push(cid)
        }
      }
      setCampaignIdsSelected(matched)
      push(`Кампаний найдено: ${arr.length}. Под ваш товар: ${matched.length}`)
    } catch (e: any) {
      // Если здесь 404 с detail "Please consult..." — это значит, что WB вернул path not found.
      // Покажем пользователю статус + detail, чтобы было понятнее.
      const status = e?.status ? `HTTP ${e.status}` : ''
      const detail = e?.detail ?? e?.message ?? e
      setCampaignsError(`${status} ${String(detail)}`.trim())
    } finally {
      setCampaignsLoading(false)
    }
  }

  const campaignsForUi = useMemo(() => {
    const base = campaigns
      .map((c) => {
        const id = Number(c?.advertId ?? c?.id)
        const name = String(c?.name ?? c?.settings?.name ?? `Кампания ${id}`)
        const status = c?.status ?? c?.statusID ?? ''
        const payment = c?.paymentType ?? c?.settings?.payment_type ?? c?.payment_type ?? ''
        const hasNm = extractNmIdsFromCampaign(c).includes(nmId)
        return { raw: c, id, name, status, payment, hasNm }
      })
      .filter((x) => Number.isFinite(x.id))

    if (!selectedProduct || !Number.isFinite(nmId)) return base
    return base.filter((c) => c.hasNm)
  }, [campaigns, nmId, selectedProduct])

  async function preparePhotos(files: FileList | null) {
    if (!files || files.length < 2) {
      push('Нужно выбрать минимум 2 фото')
      return
    }
    if (files.length > 4) {
      push('Максимум 4 варианта')
      return
    }
    if (!selectedProduct || !Number.isFinite(nmId) || nmId <= 0) {
      push('Сначала подтяните список товаров и выберите товар')
      return
    }
    const actualNmId = nmId

    setUploadingPhotos(true)
    try {
      const before = await getCardByNmId(sellerToken, actualNmId, openApiStrategyId)
      const baseUrls = before.card ? getBigPhotoUrls(before.card) : []
      const startNo = baseUrls.length + 1

      // загрузка файлов как новые фото (добавляем в конец)
      const fileArr = Array.from(files)
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i]
        const photoNumber = startNo + i
        await uploadMediaFile(sellerToken, { nmId: actualNmId, photoNumber, file }, openApiStrategyId)
      }

      const after = await getCardByNmId(sellerToken, actualNmId, openApiStrategyId)
      const allUrls = after.card ? getBigPhotoUrls(after.card) : []

      const variants: AbVariant[] = fileArr.map((f, i) => {
        const photoNumber = startNo + i
        const url = guessUrlByPhotoNumber(allUrls, photoNumber) ?? allUrls[photoNumber - 1]
        return {
          id: newId(),
          kind: 'photo',
          label: `Фото ${i + 1}: ${f.name}`,
          coverUrl: url,
        }
      })

      setPhotosBaseline(baseUrls)
      setPhotosAll(allUrls)
      setPhotoVariants(variants)
      push(`Фото загружены в карточку. Вариантов: ${variants.length}`)
    } catch (e: any) {
      push(`Ошибка загрузки фото: ${String(e?.detail ?? e?.message ?? e)}`)
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function prepareBaselinePrice() {
    if (!selectedProduct || !Number.isFinite(nmId) || nmId <= 0) {
      push('Сначала подтяните список товаров и выберите товар')
      return
    }
    const actualNmId = nmId
    try {
      const r = await getCurrentPrice(sellerToken, actualNmId, openApiStrategyId)
      setBaselinePrice({ price: r.price, discount: r.discount })
      setPriceVariants((prev) => {
        const v = [...prev]
        if (!v[0]) v[0] = r.price
        if (!v[1]) v[1] = Math.max(1, r.price - 1)
        return v
      })
      push(`Базовая цена: ${r.price}, скидка: ${r.discount}%`)
    } catch (e: any) {
      push(`Ошибка получения цены: ${String(e?.detail ?? e?.message ?? e)}`)
    }
  }

  async function startTest() {
    if (activeTest) {
      push('Сначала остановите текущий тест')
      return
    }
    if (!adsToken) {
      push('Нужен токен WB Ads (Promotion)')
      return
    }
    if (!selectedProduct || !Number.isFinite(nmId) || nmId <= 0) {
      push('Сначала подтяните список товаров и выберите товар')
      return
    }
    const actualNmId = nmId
    if (campaignIdsSelected.length === 0) {
      push('Выберите хотя бы одну рекламную кампанию')
      return
    }
    if (slotMinutes < 10 || slotMinutes > 200) {
      push('Интервал должен быть 10..200 минут')
      return
    }

    let variants: AbVariant[] = []
    const testId = newId()

    if (type === 'photo') {
      if (photoVariants.length < 2) {
        push('Сначала загрузите 2–4 фото-варианта')
        return
      }
      variants = photoVariants
    } else {
      if (!baselinePrice) {
        push('Сначала нажмите «Получить базовую цену»')
        return
      }
      const arr = priceVariants.filter((x) => Number.isFinite(x) && x > 0)
      if (arr.length < 2 || arr.length > 4) {
        push('Нужно 2–4 варианта цены')
        return
      }
      variants = arr.map((p, i) => ({
        id: newId(),
        kind: 'price',
        label: `Цена ${i + 1}: ${p}`,
        price: p,
      }))
    }

    const metrics: any = {}
    for (const v of variants) {
      metrics[v.id] = { views: 0, clicks: 0, atbs: 0, orders: 0, ctr: 0 }
    }

    const test: AbTest = {
      id: testId,
      createdAt: new Date().toISOString(),
      name: ensureTestName(),
      nmId: actualNmId,
      type,
      slotMinutes,
      campaignIds: campaignIdsSelected,
      baselinePhotoUrls: photosBaseline ?? undefined,
      allPhotoUrls: photosAll ?? undefined,
      baselinePrice: baselinePrice ?? undefined,
      variants,
      status: 'running',
      activeVariantId: variants[0].id,
      metrics,
      history: [],
    }

    // применяем первый вариант сразу
    try {
      await applyVariant(sellerToken, test, variants[0], openApiStrategyId)
    } catch (e: any) {
      if (type === 'price' && isPriceAlreadySetError(e)) {
        push('Вариант цены уже установлен, продолжаем тест')
      } else {
        push(`Не удалось применить вариант: ${String(e?.detail ?? e?.message ?? e)}`)
        return
      }
    }

    // берём стартовую точку метрик
    try {
      const totals = await fetchTotalsFromAds(adsToken, campaignIdsSelected, actualNmId)
      test.lastTotals = totals
      test.history.push({ ts: new Date().toISOString(), variantId: variants[0].id, delta: { views: 0, clicks: 0, atbs: 0, orders: 0 }, totalsAfter: totals })
    } catch (e: any) {
      push(`Не удалось получить стартовую статистику: ${String(e?.detail ?? e?.message ?? e)}`)
      // всё равно запускаем, но без lastTotals (следующий тик попробует)
    }

    upsertAbTest(test)
    setTests(loadAbTests())
    setActiveId(test.id)
    setSelectedTestId(test.id)
    push('A/B тест запущен')

    // запускаем таймер
    intervalRef.current = window.setInterval(async () => {
      try {
        await tick(test.id)
      } catch (e) {
        // ошибки уже обрабатываем в tick
      }
    }, slotMinutes * 60 * 1000)
  }

  async function tick(testId: string) {
    const current = loadAbTests().find((t) => t.id === testId)
    if (!current || current.status !== 'running') return
    if (!current.activeVariantId) return

    if (!adsToken) {
      push('Не могу снять метрики: нет токена WB Ads (Promotion)')
      return
    }

    // 1) снимаем текущие totals
    let totals: any
    try {
      totals = await fetchTotalsFromAds(adsToken, current.campaignIds, current.nmId)
    } catch (e: any) {
      push(`Статистика: ошибка ${String(e?.detail ?? e?.message ?? e)}`)
      return
    }

    // если это первый удачный сбор
    if (!current.lastTotals) {
      current.lastTotals = totals
      upsertAbTest(current)
      setTests(loadAbTests())
      return
    }

    // 2) считаем дельту и добавляем к метрикам активного варианта
    const delta = diffTotals(totals, current.lastTotals)
    const m = current.metrics[current.activeVariantId]
    m.views += delta.views
    m.clicks += delta.clicks
    m.atbs += delta.atbs
    m.orders += delta.orders
    m.ctr = ctr(m.clicks, m.views)

    current.history.push({ ts: new Date().toISOString(), variantId: current.activeVariantId, delta, totalsAfter: totals })
    current.lastTotals = totals

    // 3) переключаемся на следующий вариант
    const idx = current.variants.findIndex((v) => v.id === current.activeVariantId)
    const next = current.variants[(idx + 1) % current.variants.length]

    try {
      await applyVariant(sellerToken, current, next, openApiStrategyId)
      current.activeVariantId = next.id
    } catch (e: any) {
      if (current.type === 'price' && isPriceAlreadySetError(e)) {
        current.activeVariantId = next.id
        push('Вариант цены уже установлен, переключаемся без ошибки')
      } else {
        push(`Переключение варианта: ошибка ${String(e?.detail ?? e?.message ?? e)}`)
        // не меняем activeVariantId
      }
    }

    upsertAbTest(current)
    setTests(loadAbTests())
  }

  async function stopTest() {
    if (!activeTest) return

    const testId = activeTest.id
    // финальный тик
    try {
      await tick(testId)
    } catch {}

    const latest = loadAbTests().find((t) => t.id === testId)
    if (!latest) return

    latest.status = 'stopped'

    try {
      await restoreBaseline(sellerToken, latest, openApiStrategyId)
      push('Базовое состояние восстановлено')
    } catch (e: any) {
      push(`Не удалось восстановить базовое состояние: ${String(e?.detail ?? e?.message ?? e)}`)
    }

    upsertAbTest(latest)
    setTests(loadAbTests())
    setActiveId(null)

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [])

  const winner = useMemo(() => {
    if (!activeTest) return null
    const entries = Object.entries(activeTest.metrics)
    if (entries.length === 0) return null
    entries.sort((a, b) => (b[1].ctr ?? 0) - (a[1].ctr ?? 0))
    const bestId = entries[0][0]
    return activeTest.variants.find((v) => v.id === bestId) ?? null
  }, [activeTest])

  const displayTest = selectedTest ?? activeTest

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    const arr = !q
      ? products
      : products.filter((p) => {
          const hay = `${p.nmId} ${p.vendorCode ?? ''} ${p.title ?? ''}`.toLowerCase()
          return hay.includes(q)
        })
    return arr.slice(0, 80)
  }, [products, productQuery])

  const historyItems = useMemo(() => {
    if (!displayTest) return []
    return displayTest.history.map((h, idx) => {
      const variant = displayTest.variants.find((v) => v.id === h.variantId)
      return { ...h, idx, variant }
    })
  }, [displayTest])

  return (
    <div className="grid">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>A/B тесты карточки (CTR)</h2>
        <div className="small">
          Тест работает «по времени»: каждые {slotMinutes} мин приложение переключает вариант (фото/цена) и записывает дельту
          просмотров/кликов/корзины/заказов из рекламы. Для работы нужно держать страницу открытой.
        </div>

        <div style={{ height: 10 }} />

        <div className="card" style={{ background: '#fafafa' }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>Выбор товара</strong>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn"
                onClick={() => void loadProductsPage(true)}
                disabled={productsLoading || !!activeTest}
              >
                {productsLoading ? 'Загрузка…' : products.length ? 'Обновить список товаров' : 'Подтянуть товары'}
              </button>
              {productsHasMore ? (
                <button
                  className="btn"
                  onClick={() => void loadProductsPage(false)}
                  disabled={productsLoading || !!activeTest}
                >
                  Ещё
                </button>
              ) : null}
            </div>
          </div>

          {productsError ? <div className="error">{productsError}</div> : null}

          <div className="small" style={{ marginTop: 6 }}>
            Подтянем список ваших карточек и дадим выбрать нужный товар. Если товаров много — используйте поиск.
          </div>

          <div style={{ height: 8 }} />

          <input
            className="input ab-search"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Поиск по артикулу / названию / арт. продавца"
            disabled={productsLoading}
          />

          <div style={{ height: 8 }} />

          <div className="list" style={{ maxHeight: 220, overflow: 'auto' }}>
            {products.length === 0 ? (
              <div className="small">Пока ничего не загружено.</div>
            ) : (
              filteredProducts.map((p) => (
                <label key={p.nmId} className="row" style={{ gap: 8, padding: '6px 0' }}>
                  <input
                    type="radio"
                    name="product"
                    checked={selectedProduct?.nmId === p.nmId}
                    onChange={() => onSelectProduct(p)}
                  />
                  <div style={{ lineHeight: 1.2 }}>
                    <div>
                      <b>{p.vendorCode ?? '—'}</b> · арт. продавца: {p.nmId}
                      {p.hasPhoto === false ? <span className="badge">без фото</span> : null}
                    </div>
                    <div className="small">{p.title ?? ''}</div>
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="small" style={{ marginTop: 6 }}>
            Выбрано: {selectedProduct ? (
              <>
                <b>{selectedProduct.vendorCode ?? '—'}</b> · арт. продавца: <b>{selectedProduct.nmId}</b>
                {selectedProduct.title ? <> · {selectedProduct.title}</> : null}
              </>
            ) : (
              <>ничего</>
            )}
          </div>
        </div>

        <div style={{ height: 8 }} />

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="small">Название теста</label>
          <input
            className="input"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder="Например: A/B тест обложки"
            disabled={!!activeTest}
          />
          <label className="small">Тип теста</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="photo">Фото</option>
            <option value="price">Цена</option>
          </select>
        </div>

        <div style={{ height: 8 }} />

        <div className="row">
          <label className="small">Период (10..200 мин): {slotMinutes}</label>
          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            style={{ width: 240 }}
          />
        </div>

        <div style={{ height: 12 }} />

        <div className="card" style={{ background: '#fafafa' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Рекламные кампании (источник метрик)</strong>
            <button className="btn" onClick={loadCampaigns} disabled={campaignsLoading}>
              {campaignsLoading ? 'Загрузка…' : 'Подтянуть кампании'}
            </button>
          </div>
          {campaignsError && <div className="error">{campaignsError}</div>}
          <div className="small">Выберите кампании, где крутится этот арт. продавца (мы суммируем метрики по выбранным кампаниям).</div>

          <div style={{ height: 8 }} />

          <div className="list" style={{ maxHeight: 260, overflow: 'auto' }}>
            {campaignsForUi.map((c) => {
              const checked = campaignIdsSelected.includes(c.id)
              return (
                <label key={c.id} className="card" style={{ padding: 10, borderColor: c.hasNm ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setCampaignIdsSelected((prev) => {
                        if (e.target.checked) return [...new Set([...prev, c.id])]
                        return prev.filter((x) => x !== c.id)
                      })
                    }}
                    style={{ marginRight: 8 }}
                  />
                  <div>
                    <div><strong>{c.name}</strong></div>
                    <div className="small">ID: {c.id} · status: {String(c.status)} · {String(c.payment)} {c.hasNm ? '· ✅ содержит арт. продавца' : ''}</div>
                  </div>
                </label>
              )
            })}

            {campaignsForUi.length === 0 && <div className="small muted">Пока ничего не загружено.</div>}
          </div>
        </div>

        <div style={{ height: 12 }} />

        {type === 'photo' ? (
          <div className="card" style={{ background: '#fafafa' }}>
            <strong>Варианты фото (2–4)</strong>
            <div className="small">Загрузите файлы: мы добавим их в карточку как новые фото, а потом будем менять порядок (обложку).</div>
            <div style={{ height: 8 }} />
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => preparePhotos(e.target.files)}
              disabled={uploadingPhotos || !!activeTest}
            />
            {uploadingPhotos && <div className="small">Загрузка фото в WB…</div>}
            {photoVariants.length > 0 && (
              <div style={{ marginTop: 8 }} className="small">
                Подготовлено вариантов: {photoVariants.length}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ background: '#fafafa' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Варианты цены (2–4)</strong>
              <button className="btn" onClick={prepareBaselinePrice} disabled={!!activeTest}>
                Получить базовую цену
              </button>
            </div>
            {baselinePrice && (
              <div className="small">База: {baselinePrice.price} ₽, скидка: {baselinePrice.discount}% (скидка сохраняется, меняем только цену)</div>
            )}
            <div style={{ height: 8 }} />
            {priceVariants.map((p, i) => (
              <div key={i} className="row" style={{ marginBottom: 8 }}>
                <label className="small">Вариант {i + 1}</label>
                <input
                  type="number"
                  className="input"
                  value={p || ''}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setPriceVariants((prev) => {
                      const copy = [...prev]
                      copy[i] = v
                      return copy
                    })
                  }}
                  placeholder="Цена"
                  disabled={!!activeTest}
                />
                <button
                  className="btn"
                  onClick={() => setPriceVariants((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={priceVariants.length <= 2 || !!activeTest}
                >
                  Удалить
                </button>
              </div>
            ))}
            <button
              className="btn"
              onClick={() => setPriceVariants((prev) => (prev.length < 4 ? [...prev, 0] : prev))}
              disabled={priceVariants.length >= 4 || !!activeTest}
            >
              + Добавить вариант
            </button>
          </div>
        )}

        <div style={{ height: 12 }} />

        <div className="row">
          <button className="btn primary" onClick={startTest} disabled={!!activeTest}>
            Запустить тест
          </button>
          {activeTest && (
            <button className="btn" onClick={stopTest}>
              Остановить и восстановить
            </button>
          )}
        </div>

        {activeTest && winner && (
          <div style={{ marginTop: 10 }} className="small">
            Лидер по CTR сейчас: <strong>{winner.label}</strong>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Отчёт</h2>

        <div className="ab-testsList">
          {tests.map((t) => (
            <button
              key={t.id}
              className={`ab-testItem ${selectedTestId === t.id ? 'is-active' : ''}`}
              onClick={() => setSelectedTestId(t.id)}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{t.name || `A/B тест ${t.nmId}`}</div>
                <div className="small muted">арт. продавца: {t.nmId} · {t.type} · {t.status === 'running' ? 'активен' : 'остановлен'}</div>
              </div>
              {t.status === 'running' ? <span className="badge">идёт</span> : null}
            </button>
          ))}
          {tests.length === 0 && <div className="small muted">Пока нет тестов.</div>}
        </div>

        {displayTest ? (
          <>
            <div style={{ height: 12 }} />

            <div className="ab-testHeader">
              <div>
                <div className="h3" style={{ margin: 0 }}>{displayTest.name || `A/B тест ${displayTest.nmId}`}</div>
                <div className="small muted">
                  Создан: {new Date(displayTest.createdAt).toLocaleString()} · статус: {displayTest.status === 'running' ? 'активен' : 'остановлен'}
                </div>
              </div>
              {displayTest.id === activeId ? <span className="badge">текущий тест</span> : null}
            </div>

            <div className="kv">
              <span>арт. продавца: {displayTest.nmId}</span>
              <span>тип: {displayTest.type}</span>
              <span>интервал: {displayTest.slotMinutes} мин</span>
              <span>кампаний: {displayTest.campaignIds.length}</span>
            </div>

            <div style={{ height: 12 }} />

            <div className="list">
              {displayTest.variants.map((v) => {
                const m = displayTest.metrics[v.id]
                const isActive = displayTest.status === 'running' && displayTest.activeVariantId === v.id
                return (
                  <div key={v.id} className="card" style={{ borderColor: isActive ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{v.label}</strong>
                      <span className="badge">{isActive ? '✅ сейчас показывается' : ' '}</span>
                    </div>
                    <div className="small">
                      Просмотры: {m?.views ?? 0} · Клики: {m?.clicks ?? 0} · CTR: {m?.ctr ?? 0}% · В корзину: {m?.atbs ?? 0} · Заказы: {m?.orders ?? 0}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ height: 12 }} />

            <div className="card" style={{ background: '#fafafa' }}>
              <strong>Логи теста</strong>
              <div className="small">Фиксируем, какой вариант применяли и какие метрики получили за период.</div>
              <div style={{ height: 8 }} />
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {historyItems.slice().reverse().map((h, idx) => {
                  const v = h.variant
                  const label = v?.label ?? h.variantId
                  return (
                    <div key={idx} className="ab-log">
                      {v?.kind === 'photo' && v.coverUrl ? (
                        <img src={v.coverUrl} alt={label} className="ab-thumb" />
                      ) : (
                        <div className="ab-thumb ab-thumb--price">₽</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{label}</div>
                        <div className="small muted">{new Date(h.ts).toLocaleString()}</div>
                        <div className="small">
                          Показы: {h.delta.views} · Клики: {h.delta.clicks} · Заказы: {h.delta.orders}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {historyItems.length === 0 && <div className="small muted">Пока нет данных.</div>}
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="card" style={{ background: '#fafafa' }}>
              <strong>График по интервалам</strong>
              <div className="small">Каждый столбец — один тестовый промежуток, высота по показам.</div>
              <div style={{ height: 8 }} />
              {historyItems.length > 0 ? (
                <div className="ab-chart">
                  {(() => {
                    const maxViews = Math.max(1, ...historyItems.map((h) => h.delta.views))
                    return historyItems.map((h, i) => {
                      const v = h.variant
                      const heightPct = Math.max(8, Math.round((h.delta.views / maxViews) * 100))
                      return (
                        <div key={i} className="ab-bar">
                          <div className="ab-barFill" style={{ height: `${heightPct}%` }} />
                          {v?.kind === 'photo' && v.coverUrl ? (
                            <img src={v.coverUrl} alt={v.label} className="ab-barThumb" />
                          ) : (
                            <div className="ab-barLabel">{v?.kind === 'price' ? `₽${v.price}` : '—'}</div>
                          )}
                          <div className="ab-barValue">{h.delta.views}</div>
                        </div>
                      )
                    })
                  })()}
                </div>
              ) : (
                <div className="small muted">Нет данных для графика.</div>
              )}
            </div>
          </>
        ) : (
          <div className="small muted">Нет активного теста. Запустите тест слева.</div>
        )}
      </div>
    </div>
  )
}
