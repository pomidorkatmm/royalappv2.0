import React, { useEffect, useMemo, useState } from 'react'
import kvvCommissionBySubject from './data/kvv_commission_by_subject.json'
import { loadUnitEconomyState, saveUnitEconomyState, makeDefaultUnitRows, type AdRateConfig, type ChinaConfig, type UnitEconomyRow, type UnitEconomyState } from './unitEconomyStorage'

type Props = {
  accountId: string
}

function clampNumber(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

function round2(v: number) {
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 100) / 100
}

function asNumber(v: string): number {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Возвращает день недели 0..6, где 0=Пн */
function mskDayHourNow(): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() || ''
  const hourStr = parts.find((p) => p.type === 'hour')?.value || '0'
  const hour = clampNumber(Number(hourStr), 0, 23)

  const map: Record<string, number> = { 'пн': 0, 'вт': 1, 'ср': 2, 'чт': 3, 'пт': 4, 'сб': 5, 'вс': 6 }
  const day = map[weekday.slice(0, 2)] ?? 0
  return { day, hour }
}

function computeChinaDerived(china: ChinaConfig) {
  const volumeM3 = (china.lengthCm * china.widthCm * china.heightCm) / 1_000_000
  const density = volumeM3 > 0 ? china.weightKg / volumeM3 : 0 // кг/м3
  // Тариф карго (I2): если плотность <=100, в xls это строка "400$/м3". Для расчёта логистики (J2) используем 400$/м3.
  const cargoTariff =
    density <= 100
      ? 400
      : density < 111
        ? 3.7
        : density < 151
          ? 2.9
          : density < 251
            ? 2.5
            : density < 401
              ? 2.3
              : density < 601
                ? 2.1
                : density < 801
                  ? 2.0
                  : density < 1001
                    ? 1.9
                    : 1.8

  const logisticsRub =
    density > 100
      ? cargoTariff * china.usdRate * china.weightKg * (china.batchQty || 0)
      : volumeM3 * 400 * china.usdRate * (china.batchQty || 0)

  const realCostRub = (china.unitCostCny || 0) * 1.05 * (china.cnyRate || 0) + logisticsRub
  return { volumeM3, density, cargoTariff, logisticsRub, realCostRub }
}

function computeAdCostPerSale(ad: AdRateConfig) {
  // XLS: J3 = 1000/(1000*H8*I8*J8*K8)/1000*H4
  // => H4 / (1000 * H8 * I8 * J8 * K8)
  const H4 = (ad.organicPlace - 10) * ad.stepPrice
  const denom = 1000 * ad.ctr * ad.toCart * ad.toOrder * ad.toBuyout
  if (!Number.isFinite(denom) || denom <= 0) return 0
  return H4 / denom
}

function computeRow(row: UnitEconomyRow, adCostPerSale: number) {
  const volumeL = (row.lengthCm * row.widthCm * row.heightCm) / 1000
  const logisticsMP = volumeL <= 1 ? row.mpTariff1l : row.mpTariff1l + (volumeL - 1) * row.mpTariffExtraL

  const M = row.buyoutPercent <= 0 ? 0 : row.buyoutPercent
  const reverseTariff = row.reverseTariffRub || 0
  const logisticsWithReturns = M > 0 ? (logisticsMP + reverseTariff * (1 - M)) / M : 0

  const storage = volumeL <= 1 ? row.storageTariff1l * row.turnoverDays : row.turnoverDays * (row.storageTariff1l + row.storageTariffExtraL * (volumeL - 1))

  const paidAcceptance = volumeL * row.paidAcceptanceTariff * row.paidAcceptanceCoef

  const subjectKey = (row.subject || '').trim()
  const commissionPct = (kvvCommissionBySubject as Record<string, number>)[subjectKey] ?? 0
  const commission = commissionPct / 100

  const buyerPrice = row.costRub * (1 + row.markupPct)
  const ourPrice = (1 - row.sppPct) > 0 ? buyerPrice / (1 - row.sppPct) : 0

  const marginPct = ourPrice > 0 ? (ourPrice - row.costRub - row.ffProcessingRub - logisticsWithReturns - storage - paidAcceptance - ourPrice * commission) / ourPrice : 0
  const md = marginPct * ourPrice

  const drr = ourPrice > 0 ? adCostPerSale / ourPrice : 0

  const marginalProfit = ourPrice * (marginPct - row.defectPct - drr - row.taxPct)
  const profitability = row.costRub > 0 ? marginalProfit / row.costRub : 0

  // Первая партия
  const batchCost = row.firstBatchQty * row.costRub
  const batchRevenue = row.firstBatchQty * ourPrice

  const buyoutsBudgetBuyer = row.buyoutsQty * buyerPrice
  const buyoutsExpense = row.buyoutsQty * ourPrice * (row.taxPct + commission) + row.buyoutsQty * logisticsMP

  const firstBatchProfitability = (row.contentCostRub + buyoutsExpense + batchCost) > 0 ? (marginalProfit * row.firstBatchQty) / (row.contentCostRub + buyoutsExpense + batchCost) : 0

  return {
    volumeL,
    logisticsMP,
    logisticsWithReturns,
    storage,
    paidAcceptance,
    commission,
    commissionPct,
    buyerPrice,
    ourPrice,
    marginPct,
    md,
    drr,
    marginalProfit,
    profitability,
    batchCost,
    batchRevenue,
    buyoutsBudgetBuyer,
    buyoutsExpense,
    firstBatchProfitability,
  }
}

function fmtPct(v: number) {
  return `${round2(v * 100)}%`
}

function fmtNum(v: number) {
  return String(round2(v))
}

export function UnitEconomyPage({ accountId }: Props) {
  const [state, setState] = useState<UnitEconomyState>(() => loadUnitEconomyState(accountId))
  const [activeTable, setActiveTable] = useState<'cost' | 'logistics' | 'ads' | 'margin' | 'summary'>('summary')

  useEffect(() => {
    // при смене аккаунта — подтягиваем его состояние
    setState(loadUnitEconomyState(accountId))
  }, [accountId])

  useEffect(() => {
    saveUnitEconomyState(accountId, state)
  }, [accountId, state])

  const chinaDerived = useMemo(() => computeChinaDerived(state.china), [state.china])
  const adCostPerSale = useMemo(() => computeAdCostPerSale(state.adRate), [state.adRate])

  // если себестоимость по умолчанию не задана, можно одним кликом заполнить из "Китай"
  function applyChinaCostToAll() {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => ({ ...r, costRub: chinaDerived.realCostRub })),
    }))
  }

  function applyChinaDimsToAll() {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => ({ ...r, lengthCm: prev.china.lengthCm, widthCm: prev.china.widthCm, heightCm: prev.china.heightCm })),
    }))
  }

  function setChina<K extends keyof ChinaConfig>(key: K, value: number) {
    setState((prev) => ({ ...prev, china: { ...prev.china, [key]: value } }))
  }

  function setAdRate<K extends keyof AdRateConfig>(key: K, value: number) {
    setState((prev) => ({ ...prev, adRate: { ...prev.adRate, [key]: value } }))
  }

  function setRow(id: string, patch: Partial<UnitEconomyRow>) {
    setState((prev) => ({ ...prev, rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }

  function addRow() {
    setState((prev) => {
      const nextId = String(prev.rows.length + 1)
      const base = prev.rows[0] ?? makeDefaultUnitRows(0)[0]
      return { ...prev, rows: [...prev.rows, { ...base, id: nextId }] }
    })
  }

  function removeRow(id: string) {
    setState((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== id) }))
  }

  const now = useMemo(() => mskDayHourNow(), [])
  const subjects = useMemo(() => Object.keys(kvvCommissionBySubject as Record<string, number>).sort((a, b) => a.localeCompare(b, 'ru')), [])

  return (
    <div className="grid">
      <div className="card ue-card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="h2">Unit экономика</div>
            <div className="small muted">Время МСК: день {now.day + 1}, час {String(now.hour).padStart(2, '0')}:00</div>
          </div>
          <div className="row">
            <button className="btn" onClick={applyChinaDimsToAll}>Габариты → в таблицу</button>
            <button className="btn" onClick={applyChinaCostToAll}>СС (Китай) → в таблицу</button>
          </div>
        </div>

        <div className="ue-panels">
          <div className="ue-panel">
            <div className="ue-panel-title">Китай</div>
            <div className="ue-form">
              <label>Длина, см <input value={state.china.lengthCm} onChange={(e) => setChina('lengthCm', asNumber(e.target.value))} /></label>
              <label>Ширина, см <input value={state.china.widthCm} onChange={(e) => setChina('widthCm', asNumber(e.target.value))} /></label>
              <label>Высота, см <input value={state.china.heightCm} onChange={(e) => setChina('heightCm', asNumber(e.target.value))} /></label>
              <label>Вес, кг <input value={state.china.weightKg} onChange={(e) => setChina('weightKg', asNumber(e.target.value))} /></label>
              <label>Курс доллара <input value={state.china.usdRate} onChange={(e) => setChina('usdRate', asNumber(e.target.value))} /></label>
              <label>Курс юаня <input value={state.china.cnyRate} onChange={(e) => setChina('cnyRate', asNumber(e.target.value))} /></label>
              <label>Партия, шт <input value={state.china.batchQty} onChange={(e) => setChina('batchQty', asNumber(e.target.value))} /></label>
              <label>СС ед., юани <input value={state.china.unitCostCny} onChange={(e) => setChina('unitCostCny', asNumber(e.target.value))} /></label>
            </div>

            <div className="ue-kpis">
              <div className="ue-kpi">
                <div className="small muted">Объем, м³</div>
                <div className="kpi">{fmtNum(chinaDerived.volumeM3)}</div>
              </div>
              <div className="ue-kpi">
                <div className="small muted">Плотность, кг/м³</div>
                <div className="kpi">{fmtNum(chinaDerived.density)}</div>
              </div>
              <div className="ue-kpi">
                <div className="small muted">Логистика в РФ (J2)</div>
                <div className="kpi">{fmtNum(chinaDerived.logisticsRub)}</div>
              </div>
              <div className="ue-kpi">
                <div className="small muted">Реальная СС, руб. (H7)</div>
                <div className="kpi">{fmtNum(chinaDerived.realCostRub)}</div>
              </div>
            </div>
          </div>

          <div className="ue-panel">
            <div className="ue-panel-title">Рекламная ставка</div>
            <div className="ue-form">
              <label>Орг. место (H2) <input value={state.adRate.organicPlace} onChange={(e) => setAdRate('organicPlace', asNumber(e.target.value))} /></label>
              <label>Цена шага (H3) <input value={state.adRate.stepPrice} onChange={(e) => setAdRate('stepPrice', asNumber(e.target.value))} /></label>
              <label>CTR (H8) <input value={state.adRate.ctr} onChange={(e) => setAdRate('ctr', asNumber(e.target.value))} /></label>
              <label>В корзину (I8) <input value={state.adRate.toCart} onChange={(e) => setAdRate('toCart', asNumber(e.target.value))} /></label>
              <label>В заказ (J8) <input value={state.adRate.toOrder} onChange={(e) => setAdRate('toOrder', asNumber(e.target.value))} /></label>
              <label>В выкуп (K8) <input value={state.adRate.toBuyout} onChange={(e) => setAdRate('toBuyout', asNumber(e.target.value))} /></label>
            </div>

            <div className="ue-kpis">
              <div className="ue-kpi">
                <div className="small muted">Ставка для ТОП‑10 (H4)</div>
                <div className="kpi">{fmtNum((state.adRate.organicPlace - 10) * state.adRate.stepPrice)}</div>
              </div>
              <div className="ue-kpi">
                <div className="small muted">Стоимость продажи по РК (J3)</div>
                <div className="kpi">{fmtNum(adCostPerSale)}</div>
              </div>
              <div className="ue-kpi">
                <div className="small muted">ДРР (пример)</div>
                <div className="kpi">{fmtPct(state.rows[0] ? (computeRow(state.rows[0], adCostPerSale).drr) : 0)}</div>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Подставляется в таблицу как: <b>ДРР = J3 / Наша цена</b>
            </div>
          </div>
        </div>
      </div>

      <div className="card ue-card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h3">Таблица</div>
          <button className="btn primary" onClick={addRow}>Добавить строку</button>
        </div>

        <div className="ue-tabs">
          <button className={activeTable === 'cost' ? 'btn primary' : 'btn'} onClick={() => setActiveTable('cost')}>Себестоимость</button>
          <button className={activeTable === 'logistics' ? 'btn primary' : 'btn'} onClick={() => setActiveTable('logistics')}>Комиссии и логистика</button>
          <button className={activeTable === 'ads' ? 'btn primary' : 'btn'} onClick={() => setActiveTable('ads')}>Реклама</button>
          <button className={activeTable === 'margin' ? 'btn primary' : 'btn'} onClick={() => setActiveTable('margin')}>Маржинальность</button>
          <button className={activeTable === 'summary' ? 'btn primary' : 'btn'} onClick={() => setActiveTable('summary')}>Сводная таблица</button>
        </div>

        {activeTable === 'cost' && (
          <div className="ue-tableWrap">
            <table className="ue-table ue-table--compact">
              <thead>
                <tr>
                  <th> </th>
                  <th>Артикул</th>
                  <th>Предмет</th>
                  <th>Себестоимость</th>
                  <th>Обработка на ФФ</th>
                  <th>Длина, см</th>
                  <th>Ширина, см</th>
                  <th>Высота, см</th>
                  <th>Объем, л</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, idx) => {
                  const calc = computeRow(r, adCostPerSale)
                  return (
                    <tr key={r.id}>
                      <td className="ue-id">
                        {idx + 1}.
                        <button className="ue-del" title="Удалить строку" onClick={() => removeRow(r.id)}>×</button>
                      </td>
                      <td><input value={r.article} onChange={(e) => setRow(r.id, { article: e.target.value })} /></td>
                      <td>
                        <input list="ue-subjects" value={r.subject} onChange={(e) => setRow(r.id, { subject: e.target.value })} placeholder="Начните ввод…" />
                      </td>
                      <td><input value={r.costRub} onChange={(e) => setRow(r.id, { costRub: asNumber(e.target.value) })} /></td>
                      <td><input value={r.ffProcessingRub} onChange={(e) => setRow(r.id, { ffProcessingRub: asNumber(e.target.value) })} /></td>
                      <td><input value={r.lengthCm} onChange={(e) => setRow(r.id, { lengthCm: asNumber(e.target.value) })} /></td>
                      <td><input value={r.widthCm} onChange={(e) => setRow(r.id, { widthCm: asNumber(e.target.value) })} /></td>
                      <td><input value={r.heightCm} onChange={(e) => setRow(r.id, { heightCm: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.volumeL)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTable === 'logistics' && (
          <div className="ue-tableWrap">
            <table className="ue-table ue-table--compact">
              <thead>
                <tr>
                  <th> </th>
                  <th>Артикул</th>
                  <th>Объем, л</th>
                  <th>Тариф 1л</th>
                  <th>Тариф доп. л</th>
                  <th>Логистика МП</th>
                  <th>% выкупа</th>
                  <th>Тариф обратной</th>
                  <th>Логистика с возвратами</th>
                  <th>Оборачиваемость</th>
                  <th>Хранение 1л</th>
                  <th>Хранение доп. л</th>
                  <th>Хранение</th>
                  <th>Коэф. ПП</th>
                  <th>Тариф ПП</th>
                  <th>Стоимость ПП</th>
                  <th>Комиссия</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, idx) => {
                  const calc = computeRow(r, adCostPerSale)
                  return (
                    <tr key={r.id}>
                      <td className="ue-id">
                        {idx + 1}.
                        <button className="ue-del" title="Удалить строку" onClick={() => removeRow(r.id)}>×</button>
                      </td>
                      <td><input value={r.article} onChange={(e) => setRow(r.id, { article: e.target.value })} /></td>
                      <td className="ue-ro">{fmtNum(calc.volumeL)}</td>
                      <td><input value={r.mpTariff1l} onChange={(e) => setRow(r.id, { mpTariff1l: asNumber(e.target.value) })} /></td>
                      <td><input value={r.mpTariffExtraL} onChange={(e) => setRow(r.id, { mpTariffExtraL: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.logisticsMP)}</td>
                      <td><input value={r.buyoutPercent} onChange={(e) => setRow(r.id, { buyoutPercent: asNumber(e.target.value) })} /></td>
                      <td><input value={r.reverseTariffRub} onChange={(e) => setRow(r.id, { reverseTariffRub: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.logisticsWithReturns)}</td>
                      <td><input value={r.turnoverDays} onChange={(e) => setRow(r.id, { turnoverDays: asNumber(e.target.value) })} /></td>
                      <td><input value={r.storageTariff1l} onChange={(e) => setRow(r.id, { storageTariff1l: asNumber(e.target.value) })} /></td>
                      <td><input value={r.storageTariffExtraL} onChange={(e) => setRow(r.id, { storageTariffExtraL: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.storage)}</td>
                      <td><input value={r.paidAcceptanceCoef} onChange={(e) => setRow(r.id, { paidAcceptanceCoef: asNumber(e.target.value) })} /></td>
                      <td><input value={r.paidAcceptanceTariff} onChange={(e) => setRow(r.id, { paidAcceptanceTariff: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.paidAcceptance)}</td>
                      <td className="ue-ro">{fmtPct(calc.commission)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTable === 'ads' && (
          <div className="ue-tableWrap">
            <table className="ue-table ue-table--compact">
              <thead>
                <tr>
                  <th> </th>
                  <th>Артикул</th>
                  <th>Наша цена</th>
                  <th>Стоимость продажи по РК</th>
                  <th>ДРР</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, idx) => {
                  const calc = computeRow(r, adCostPerSale)
                  return (
                    <tr key={r.id}>
                      <td className="ue-id">
                        {idx + 1}.
                        <button className="ue-del" title="Удалить строку" onClick={() => removeRow(r.id)}>×</button>
                      </td>
                      <td><input value={r.article} onChange={(e) => setRow(r.id, { article: e.target.value })} /></td>
                      <td className="ue-ro">{fmtNum(calc.ourPrice)}</td>
                      <td className="ue-ro">{fmtNum(adCostPerSale)}</td>
                      <td className="ue-ro">{fmtPct(calc.drr)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTable === 'margin' && (
          <div className="ue-tableWrap">
            <table className="ue-table ue-table--compact">
              <thead>
                <tr>
                  <th> </th>
                  <th>Артикул</th>
                  <th>Цена для покупателя</th>
                  <th>СПП</th>
                  <th>Наша цена</th>
                  <th>Маржинальность</th>
                  <th>МД</th>
                  <th>Налог</th>
                  <th>Маржинальная прибыль</th>
                  <th>Рентабельность</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, idx) => {
                  const calc = computeRow(r, adCostPerSale)
                  return (
                    <tr key={r.id}>
                      <td className="ue-id">
                        {idx + 1}.
                        <button className="ue-del" title="Удалить строку" onClick={() => removeRow(r.id)}>×</button>
                      </td>
                      <td><input value={r.article} onChange={(e) => setRow(r.id, { article: e.target.value })} /></td>
                      <td className="ue-ro">{fmtNum(calc.buyerPrice)}</td>
                      <td><input value={r.sppPct} onChange={(e) => setRow(r.id, { sppPct: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.ourPrice)}</td>
                      <td className="ue-ro">{fmtPct(calc.marginPct)}</td>
                      <td className="ue-ro">{fmtNum(calc.md)}</td>
                      <td><input value={r.taxPct} onChange={(e) => setRow(r.id, { taxPct: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.marginalProfit)}</td>
                      <td className="ue-ro">{fmtPct(calc.profitability)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTable === 'summary' && (
          <div className="ue-tableWrap">
            <table className="ue-table">
              <thead>
                <tr>
                  <th rowSpan={2}> </th>
                  <th rowSpan={2}>Артикул</th>
                  <th rowSpan={2}>Предмет</th>
                  <th rowSpan={2}>Себестоимость</th>
                  <th rowSpan={2}>Обработка на ФФ</th>

                  <th colSpan={4}>Упаковка</th>
                  <th colSpan={3}>Логистика МП</th>
                  <th colSpan={3}>Обратная логистика</th>
                  <th colSpan={4}>Хранение</th>
                  <th colSpan={3}>Платная приёмка</th>

                  <th rowSpan={2}>Комиссия по FBO</th>
                  <th rowSpan={2}>Наценка</th>
                  <th colSpan={3}>Цена продажи</th>
                  <th rowSpan={2}>Маржинальность</th>
                  <th rowSpan={2}>МД</th>
                  <th rowSpan={2}>% на брак</th>
                  <th rowSpan={2}>ДРР</th>
                  <th rowSpan={2}>Налог</th>
                  <th rowSpan={2}>Маржинальная прибыль</th>
                  <th rowSpan={2}>Рентабельность</th>

                  <th className="ue-spacer" rowSpan={2}></th>

                  <th colSpan={8}>Рентабельность первой партии</th>
                  <th rowSpan={2}></th>
                </tr>
                <tr>
                  <th>Объем, л</th>
                  <th>Длина, см</th>
                  <th>Ширина, см</th>
                  <th>Высота, см</th>

                  <th>Тариф за 1л</th>
                  <th>За доп. л</th>
                  <th>Логистика МП</th>

                  <th>Процент выкупа</th>
                  <th>Тариф за 1л</th>
                  <th>Логистика с учетом возвратов</th>

                  <th>Оборачиваемость</th>
                  <th>Тариф за 1л</th>
                  <th>За доп. л</th>
                  <th>Хранение</th>

                  <th>Коэффициент</th>
                  <th>Тариф</th>
                  <th>Стоимость ПП</th>

                  <th>Для покупателя</th>
                  <th>СПП</th>
                  <th>Наша</th>

                  <th>Кол‑во</th>
                  <th>СС партии</th>
                  <th>Выручка с партии</th>
                  <th>Ориентир. по кол‑ву выкупов</th>
                  <th>Бюджет на выкупы</th>
                  <th>Расход на выкупы</th>
                  <th>Расход на контент</th>
                  <th>Рентабельность первой партии</th>
                </tr>
              </thead>

              <tbody>
                <tr className="ue-help">
                  <td>Описание</td>
                  <td>Артикул продавца. Придумывается самостоятельно</td>
                  <td>Категория товара (как на Wildberries)</td>
                  <td>Китай — авто через H7. РФ — вручную</td>
                  <td>Средняя стоимость услуг от приемки до отгрузки (≈70)</td>

                  <td>Авто</td>
                  <td>Габариты упаковки</td>
                  <td>Габариты упаковки</td>
                  <td>Габариты упаковки</td>

                  <td>Тарифы склада МСК</td>
                  <td>Тарифы склада МСК</td>
                  <td>Авто</td>

                  <td>Процент выкупа ТОП‑1 (например 0,95)</td>
                  <td>Фикс (обычно 50)</td>
                  <td>Авто</td>

                  <td>Среднее по топу</td>
                  <td>Тарифы склада МСК</td>
                  <td>Тарифы склада МСК</td>
                  <td>Авто</td>

                  <td>Коэф. склада</td>
                  <td>Тариф</td>
                  <td>Авто</td>

                  <td>VLOOKUP по предмету</td>
                  <td>Наценка (1 = 100%)</td>
                  <td>Авто</td>
                  <td>СПП (доля)</td>
                  <td>Авто</td>

                  <td>Авто</td>
                  <td>Авто</td>
                  <td>Доля</td>
                  <td>Авто</td>
                  <td>Доля</td>
                  <td>Авто</td>
                  <td>Авто</td>

                  <td className="ue-spacer"></td>

                  <td>Кол‑во первой партии</td>
                  <td>Авто</td>
                  <td>Авто</td>
                  <td>Сколько выкупов</td>
                  <td>Авто</td>
                  <td>Авто</td>
                  <td>Контент</td>
                  <td>Авто</td>

                  <td></td>
                </tr>

                {state.rows.map((r, idx) => {
                  const calc = computeRow(r, adCostPerSale)

                  return (
                    <tr key={r.id}>
                      <td className="ue-id">
                        {idx + 1}.
                        <button className="ue-del" title="Удалить строку" onClick={() => removeRow(r.id)}>×</button>
                      </td>

                      <td><input value={r.article} onChange={(e) => setRow(r.id, { article: e.target.value })} /></td>

                      <td>
                        <input list="ue-subjects" value={r.subject} onChange={(e) => setRow(r.id, { subject: e.target.value })} placeholder="Начните ввод…" />
                      </td>

                      <td><input value={r.costRub} onChange={(e) => setRow(r.id, { costRub: asNumber(e.target.value) })} /></td>
                      <td><input value={r.ffProcessingRub} onChange={(e) => setRow(r.id, { ffProcessingRub: asNumber(e.target.value) })} /></td>

                      <td className="ue-ro">{fmtNum(calc.volumeL)}</td>
                      <td><input value={r.lengthCm} onChange={(e) => setRow(r.id, { lengthCm: asNumber(e.target.value) })} /></td>
                      <td><input value={r.widthCm} onChange={(e) => setRow(r.id, { widthCm: asNumber(e.target.value) })} /></td>
                      <td><input value={r.heightCm} onChange={(e) => setRow(r.id, { heightCm: asNumber(e.target.value) })} /></td>

                      <td><input value={r.mpTariff1l} onChange={(e) => setRow(r.id, { mpTariff1l: asNumber(e.target.value) })} /></td>
                      <td><input value={r.mpTariffExtraL} onChange={(e) => setRow(r.id, { mpTariffExtraL: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.logisticsMP)}</td>

                      <td><input value={r.buyoutPercent} onChange={(e) => setRow(r.id, { buyoutPercent: asNumber(e.target.value) })} /></td>
                      <td><input value={r.reverseTariffRub} onChange={(e) => setRow(r.id, { reverseTariffRub: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.logisticsWithReturns)}</td>

                      <td><input value={r.turnoverDays} onChange={(e) => setRow(r.id, { turnoverDays: asNumber(e.target.value) })} /></td>
                      <td><input value={r.storageTariff1l} onChange={(e) => setRow(r.id, { storageTariff1l: asNumber(e.target.value) })} /></td>
                      <td><input value={r.storageTariffExtraL} onChange={(e) => setRow(r.id, { storageTariffExtraL: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.storage)}</td>

                      <td><input value={r.paidAcceptanceCoef} onChange={(e) => setRow(r.id, { paidAcceptanceCoef: asNumber(e.target.value) })} /></td>
                      <td><input value={r.paidAcceptanceTariff} onChange={(e) => setRow(r.id, { paidAcceptanceTariff: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.paidAcceptance)}</td>

                      <td className="ue-ro">{fmtPct(calc.commission)}</td>

                      <td><input value={r.markupPct} onChange={(e) => setRow(r.id, { markupPct: asNumber(e.target.value) })} /></td>

                      <td className="ue-ro">{fmtNum(calc.buyerPrice)}</td>
                      <td><input value={r.sppPct} onChange={(e) => setRow(r.id, { sppPct: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.ourPrice)}</td>

                      <td className="ue-ro">{fmtPct(calc.marginPct)}</td>
                      <td className="ue-ro">{fmtNum(calc.md)}</td>

                      <td><input value={r.defectPct} onChange={(e) => setRow(r.id, { defectPct: asNumber(e.target.value) })} /></td>

                      <td className="ue-ro">{fmtPct(calc.drr)}</td>

                      <td><input value={r.taxPct} onChange={(e) => setRow(r.id, { taxPct: asNumber(e.target.value) })} /></td>

                      <td className="ue-ro">{fmtNum(calc.marginalProfit)}</td>
                      <td className="ue-ro">{fmtPct(calc.profitability)}</td>

                      <td className="ue-spacer"></td>

                      <td><input value={r.firstBatchQty} onChange={(e) => setRow(r.id, { firstBatchQty: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.batchCost)}</td>
                      <td className="ue-ro">{fmtNum(calc.batchRevenue)}</td>
                      <td><input value={r.buyoutsQty} onChange={(e) => setRow(r.id, { buyoutsQty: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtNum(calc.buyoutsBudgetBuyer)}</td>
                      <td className="ue-ro">{fmtNum(calc.buyoutsExpense)}</td>
                      <td><input value={r.contentCostRub} onChange={(e) => setRow(r.id, { contentCostRub: asNumber(e.target.value) })} /></td>
                      <td className="ue-ro">{fmtPct(calc.firstBatchProfitability)}</td>

                      <td></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <datalist id="ue-subjects">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
