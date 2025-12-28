import { STORAGE_KEYS } from '../../config'

export type ChinaConfig = {
  // Габариты упаковки (см)
  lengthCm: number
  widthCm: number
  heightCm: number
  // Вес (кг)
  weightKg: number
  // Курсы
  usdRate: number
  cnyRate: number
  // Партия (шт)
  batchQty: number
  // Себестоимость (юани) за 1 ед.
  unitCostCny: number
  // Доп. параметры
  densityKgPerM3?: number
}

export type AdRateConfig = {
  // Расчетное орг. место (H2) и цена за шаг (H3) — из листа "Рекламная ставка"
  organicPlace: number
  stepPrice: number

  // Конверсии (лист "Рекламная ставка"): CTR / В корзину / В заказ / В выкуп
  ctr: number // H8
  toCart: number // I8
  toOrder: number // J8
  toBuyout: number // K8
}

export type UnitEconomyRow = {
  id: string
  // Артикул / предмет
  article: string
  subject: string

  // Себестоимость
  costRub: number
  // Обработка на ФФ
  ffProcessingRub: number

  // Упаковка
  lengthCm: number
  widthCm: number
  heightCm: number

  // Логистика МП (тарифы)
  mpTariff1l: number
  mpTariffExtraL: number

  // Обратная логистика
  buyoutPercent: number
  reverseTariffRub: number // фикс 50 по шаблону (можно менять)

  // Хранение
  turnoverDays: number
  storageTariff1l: number
  storageTariffExtraL: number

  // Платная приемка
  paidAcceptanceCoef: number
  paidAcceptanceTariff: number // тариф (U)

  // Наценка и цена
  markupPct: number
  sppPct: number

  // % на брак, налог
  defectPct: number
  taxPct: number

  // Первая партия
  firstBatchQty: number
  buyoutsQty: number
  contentCostRub: number
}

export type UnitEconomyState = {
  china: ChinaConfig
  adRate: AdRateConfig
  rows: UnitEconomyRow[]
}

const defaultChina: ChinaConfig = {
  lengthCm: 0,
  widthCm: 0,
  heightCm: 0,
  weightKg: 0,
  usdRate: 0,
  cnyRate: 0,
  batchQty: 0,
  unitCostCny: 0,
}

const defaultAdRate: AdRateConfig = {
  organicPlace: 0,
  stepPrice: 0,
  ctr: 0.05,
  toCart: 0,
  toOrder: 0,
  toBuyout: 0,
}

export function makeDefaultUnitRows(costRubFallback: number): UnitEconomyRow[] {
  const base = {
    article: '',
    subject: '',
    costRub: costRubFallback,
    ffProcessingRub: 70,
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    mpTariff1l: 0,
    mpTariffExtraL: 0,
    buyoutPercent: 0.95,
    reverseTariffRub: 50,
    turnoverDays: 0,
    storageTariff1l: 0,
    storageTariffExtraL: 0,
    paidAcceptanceCoef: 0,
    paidAcceptanceTariff: 1.7,
    markupPct: 1.0,
    sppPct: 0.0,
    defectPct: 0.03,
    taxPct: 0.07,
    firstBatchQty: 0,
    buyoutsQty: 0,
    contentCostRub: 15000,
  }

  const rows: UnitEconomyRow[] = []
  for (let i = 1; i <= 10; i++) {
    rows.push({ id: String(i), ...base })
  }
  return rows
}

function getKey(accountId: string) {
  return `${STORAGE_KEYS.unitEconomy}::${accountId || 'default'}`
}

export function loadUnitEconomyState(accountId: string): UnitEconomyState {
  try {
    const raw = localStorage.getItem(getKey(accountId))
    if (!raw) {
      return {
        china: defaultChina,
        adRate: defaultAdRate,
        rows: makeDefaultUnitRows(0),
      }
    }
    const parsed = JSON.parse(raw) as UnitEconomyState
    return {
      china: { ...defaultChina, ...(parsed.china || {}) },
      adRate: { ...defaultAdRate, ...(parsed.adRate || {}) },
      rows: Array.isArray(parsed.rows) ? parsed.rows : makeDefaultUnitRows(0),
    }
  } catch {
    return {
      china: defaultChina,
      adRate: defaultAdRate,
      rows: makeDefaultUnitRows(0),
    }
  }
}

export function saveUnitEconomyState(accountId: string, state: UnitEconomyState) {
  localStorage.setItem(getKey(accountId), JSON.stringify(state))
}
