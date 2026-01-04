import fetch from 'node-fetch'
import { chromium } from 'playwright'

export class StocksTransferModule {
  constructor({ wbToken, portalLogin, portalPassword, headless = true }) {
    this.wbToken = wbToken
    this.portalLogin = portalLogin
    this.portalPassword = portalPassword
    this.headless = headless
  }

  async getWarehouses() {
    const r = await fetch('https://marketplace-api.wildberries.ru/api/v3/warehouses', {
      headers: { Authorization: this.wbToken },
    })
    if (!r.ok) throw new Error(`Warehouses error: ${r.status}`)
    return r.json()
  }

  async getStocks(warehouseId) {
    const r = await fetch(`https://marketplace-api.wildberries.ru/api/v3/stocks/${warehouseId}`, {
      headers: { Authorization: this.wbToken },
    })
    if (!r.ok) throw new Error(`Stocks error: ${r.status}`)
    return r.json()
  }

  buildTransferPlan({ warehouses, stocksByWarehouse }) {
    const plan = []
    const skuMap = new Map()
    for (const [warehouseId, stocks] of Object.entries(stocksByWarehouse)) {
      for (const s of stocks) {
        const key = String(s.sku ?? s.barcode ?? s.nmId ?? '')
        if (!key) continue
        const entry = skuMap.get(key) ?? { skuKey: key, perWarehouse: {}, title: s.title ?? s.itemName ?? key }
        entry.perWarehouse[warehouseId] = (entry.perWarehouse[warehouseId] ?? 0) + Number(s.quantity ?? s.amount ?? 0)
        skuMap.set(key, entry)
      }
    }
    for (const item of skuMap.values()) {
      const amounts = Object.entries(item.perWarehouse).map(([id, qty]) => ({ id, qty }))
      if (amounts.length < 2) continue
      const sorted = [...amounts].sort((a, b) => a.qty - b.qty)
      const deficit = sorted[0]
      const surplus = sorted[sorted.length - 1]
      if (!deficit || !surplus || surplus.qty <= 0 || deficit.qty >= surplus.qty) continue
      plan.push({
        skuKey: item.skuKey,
        qty: Math.floor((surplus.qty - deficit.qty) / 2),
        fromWarehouse: surplus.id,
        toWarehouse: deficit.id,
        reason: 'баланс профицит/дефицит',
      })
    }
    return plan
  }

  async sendTransfer({ skuKey, qty, fromWarehouse, toWarehouse }) {
    // Официального API нет — используем автоматизацию веб-форм ЛК.
    const browser = await chromium.launch({ headless: this.headless })
    const page = await browser.new_page()
    try {
      await page.goto('https://seller.wildberries.ru/')
      await page.fill('input[name="login"]', this.portalLogin)
      await page.fill('input[name="password"]', this.portalPassword)
      await page.click('button[type="submit"]')

      // TODO: обработка 2FA/капчи — дождаться подтверждения пользователя.
      await page.wait_for_timeout(2000)

      // Перейти в раздел перемещений остатков и заполнить форму.
      await page.goto('https://seller.wildberries.ru/supplier-portal/warehouse-move')
      await page.fill('input[name="sku"]', skuKey)
      await page.fill('input[name="qty"]', String(qty))
      await page.select_option('select[name="fromWarehouse"]', String(fromWarehouse))
      await page.select_option('select[name="toWarehouse"]', String(toWarehouse))
      await page.click('button[type="submit"]')

      await page.wait_for_timeout(1500)
      return { status: 'sent' }
    } finally {
      await browser.close()
    }
  }
}
