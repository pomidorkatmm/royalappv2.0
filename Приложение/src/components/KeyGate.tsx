import React, { useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS } from '../config'
import { validateToken, WbHttpError } from '../api/wbClient'
import { validateAdsToken } from '../api/wbAdsClient'

type Props = {
  onConnected: (sellerToken: string, adsToken: string | null) => void
}

export default function KeyGate({ onConnected }: Props) {
  const [sellerToken, setSellerToken] = useState('')
  const [adsToken, setAdsToken] = useState('')

  const [sellerStatus, setSellerStatus] = useState<'idle' | 'validating' | 'ok' | 'error'>('idle')
  const [adsStatus, setAdsStatus] = useState<'idle' | 'validating' | 'ok' | 'error'>('idle')

  const [sellerErrorText, setSellerErrorText] = useState('')
  const [adsErrorText, setAdsErrorText] = useState('')

  // автоподхват из localStorage
  useEffect(() => {
    // миграция старого ключа (если был)
    const legacy = localStorage.getItem(STORAGE_KEYS.apiKeyLegacy) || ''
    const savedSeller = localStorage.getItem(STORAGE_KEYS.sellerApiKey) || legacy
    const savedAds = localStorage.getItem(STORAGE_KEYS.adsApiKey) || ''

    if (savedSeller) {
      setSellerToken(savedSeller)
      void checkSeller(savedSeller)
    }
    if (savedAds) {
      setAdsToken(savedAds)
      void checkAds(savedAds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canCheckSeller = useMemo(() => sellerToken.trim().length > 0, [sellerToken])
  const canCheckAds = useMemo(() => adsToken.trim().length > 0, [adsToken])

  async function checkSeller(t: string) {
    setSellerStatus('validating')
    setSellerErrorText('')
    try {
      await validateToken(t.trim())
      setSellerStatus('ok')
      localStorage.setItem(STORAGE_KEYS.sellerApiKey, t.trim())
      // чистим legacy, чтобы не путать
      localStorage.removeItem(STORAGE_KEYS.apiKeyLegacy)

      const ads = adsToken.trim() ? adsToken.trim() : null
      onConnected(t.trim(), ads)
    } catch (e: any) {
      setSellerStatus('error')
      if (e instanceof WbHttpError) {
        setSellerErrorText(e.detail ? `${e.status} ${e.message}: ${e.detail}` : `${e.status} ${e.message}`)
      } else {
        setSellerErrorText(String(e?.message ?? e))
      }
    }
  }

  async function checkAds(t: string) {
    setAdsStatus('validating')
    setAdsErrorText('')
    try {
      await validateAdsToken(t.trim())
      setAdsStatus('ok')
      localStorage.setItem(STORAGE_KEYS.adsApiKey, t.trim())

      // если продавец-токен уже валиден — обновим connected
      if (sellerStatus === 'ok' && sellerToken.trim()) {
        onConnected(sellerToken.trim(), t.trim())
      }
    } catch (e: any) {
      setAdsStatus('error')
      if (e instanceof WbHttpError) {
        setAdsErrorText(e.detail ? `${e.status} ${e.message}: ${e.detail}` : `${e.status} ${e.message}`)
      } else {
        setAdsErrorText(String(e?.message ?? e))
      }
    }
  }

  // автоматическая проверка после паузы (похоже на "вставил ключ и подождал")
  useEffect(() => {
    if (!canCheckSeller) return
    if (sellerStatus === 'ok') return
    const t = sellerToken.trim()
    const h = window.setTimeout(() => {
      void checkSeller(t)
    }, 600)
    return () => window.clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerToken])

  useEffect(() => {
    if (!canCheckAds) return
    if (adsStatus === 'ok') return
    const t = adsToken.trim()
    const h = window.setTimeout(() => {
      void checkAds(t)
    }, 600)
    return () => window.clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsToken])

  const sellerBadge =
    sellerStatus === 'ok'
      ? '✅ ключ для отзывов принят'
      : sellerStatus === 'validating'
        ? 'Проверяем ключ для отзывов…'
        : sellerStatus === 'error'
          ? '❌ ошибка (отзывы)'
          : 'Вставьте API‑ключ (Отзывы/Контент/Цены)'

  const adsBadge =
    adsStatus === 'ok'
      ? '✅ ключ для рекламы принят'
      : adsStatus === 'validating'
        ? 'Проверяем ключ для рекламы…'
        : adsStatus === 'error'
          ? '❌ ошибка (реклама)'
          : 'Вставьте API‑ключ (Promotion / Реклама)'

  return (
    <div className="container">
      <div className="card">
        <div className="brand" style={{ marginBottom: 10 }}>
          <h1>WB • Отзывы продавца</h1>
          <span className="badge">Локальное веб‑приложение</span>
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          Ключи хранятся локально в вашем браузере (LocalStorage) и никуда не отправляются, кроме запросов к WB API.
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          <b>Важно:</b> WB часто требует <b>отдельный токен</b> для рекламы (категория <b>Promotion</b>). Поэтому здесь два поля.
        </div>

        <div className="row" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Токен WB (Отзывы/Контент/Цены)"
            value={sellerToken}
            onChange={(e) => setSellerToken(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              // даём вставиться
              requestAnimationFrame(() => {
                void checkSeller(pasted)
              })
            }}
          />
          <button
            className="btn primary"
            onClick={() => void checkSeller(sellerToken)}
            disabled={!canCheckSeller || sellerStatus === 'validating'}
            title="Проверить токен для отзывов"
          >
            Проверить (отзывы)
          </button>
        </div>

        <div className="badge" style={{ display: 'inline-block', marginBottom: 10 }}>
          {sellerBadge}
        </div>

        {sellerStatus === 'error' && sellerErrorText && (
          <div className="small error" style={{ marginTop: 10, marginBottom: 10 }}>
            {sellerErrorText}
          </div>
        )}

        <div className="row" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Токен WB Ads (Promotion / Реклама)"
            value={adsToken}
            onChange={(e) => setAdsToken(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              requestAnimationFrame(() => {
                void checkAds(pasted)
              })
            }}
          />
          <button
            className="btn primary"
            onClick={() => void checkAds(adsToken)}
            disabled={!canCheckAds || adsStatus === 'validating'}
            title="Проверить токен для рекламы"
          >
            Проверить (реклама)
          </button>
          <button
            className="btn"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEYS.sellerApiKey)
              localStorage.removeItem(STORAGE_KEYS.adsApiKey)
              localStorage.removeItem(STORAGE_KEYS.apiKeyLegacy)
              setSellerToken('')
              setAdsToken('')
              setSellerStatus('idle')
              setAdsStatus('idle')
              setSellerErrorText('')
              setAdsErrorText('')
              onConnected('', null)
            }}
          >
            Очистить ключи
          </button>
        </div>

        <div className="badge" style={{ display: 'inline-block' }}>
          {adsBadge}
        </div>

        {adsStatus === 'error' && adsErrorText && (
          <div className="small error" style={{ marginTop: 10 }}>
            {adsErrorText}
          </div>
        )}

        <div className="small" style={{ marginTop: 12 }}>
          Если вы видите 401/403 — проверьте галочки при создании токена:
          <ul style={{ margin: '8px 0 0 18px' }}>
            <li>
              <b>Токен продавца</b>: <b>Feedbacks and Questions</b> + <b>Content</b> + <b>Prices and Discounts</b> (уровень доступа: <b>Read and Write</b>).
            </li>
            <li>
              <b>Токен рекламы</b>: <b>Promotion</b> (можно <b>Read only</b>).
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
