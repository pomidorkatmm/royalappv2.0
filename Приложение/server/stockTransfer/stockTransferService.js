import { chromium } from 'playwright'

const SESSION = { cookies: [], localStorage: {}, sessionStorage: {} }

function log(message) {
  const entry = { ts: new Date().toISOString(), message }
  console.log('[StockTransfer]', message)
  return entry
}

function buildStorageState() {
  return {
    cookies: SESSION.cookies,
    origins: [
      {
        origin: 'https://seller.wildberries.ru',
        localStorage: Object.entries(SESSION.localStorage).map(([name, value]) => ({ name, value })),
      },
    ],
  }
}

export class StockTransferService {
  constructor() {
    this.logs = []
  }

  saveSession(payload) {
    SESSION.cookies = payload.cookies || []
    SESSION.localStorage = payload.localStorage || {}
    SESSION.sessionStorage = payload.sessionStorage || {}
    this.logs.push(log('Сессия сохранена'))
    return { status: 'ok' }
  }

  async withSessionPage() {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.new_context({ storage_state: buildStorageState() })
    const page = await context.new_page()
    await page.add_init_script((data) => {
      const entries = data?.sessionStorage ? Object.entries(data.sessionStorage) : []
      for (const [k, v] of entries) sessionStorage.setItem(k, String(v))
    }, { sessionStorage: SESSION.sessionStorage })
    return { browser, page }
  }

  async fetchStocks() {
    const { browser, page } = await this.withSessionPage()
    const logs = []
    try {
      logs.push(log('Открываем отчет по остаткам'))
      await page.goto('https://seller.wildberries.ru/analytics/stock-report', { wait_until: 'load' })
      await page.wait_for_timeout(1000)
      const rows = []
      let hasNext = true
      while (hasNext) {
        const pageRows = await page.evaluate(() => {
          const table = document.querySelector('table')
          if (!table) return []
          const body = table.querySelector('tbody')
          if (!body) return []
          return Array.from(body.querySelectorAll('tr')).map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() || ''),
          )
        })
        rows.push(...pageRows)
        const nextBtn = await page.locator('button:has-text("Далее"), button[aria-label="Next"]').first()
        if (await nextBtn.count()) {
          const disabled = await nextBtn.get_attribute('disabled')
          if (disabled != null) {
            hasNext = false
          } else {
            await nextBtn.click()
            await page.wait_for_timeout(800)
          }
        } else {
          hasNext = false
        }
      }
      logs.push(log(`Получено строк: ${rows.length}`))
      return { status: 'ok', rows, logs }
    } catch (e) {
      logs.push(log(`Ошибка отчета: ${String(e?.message ?? e)}`))
      return { status: 'error', message: 'stocks_failed', rows: [], logs }
    } finally {
      await browser.close()
    }
  }

  async executeTransfers(tasks) {
    const { browser, page } = await this.withSessionPage()
    const logs = []
    const results = []
    try {
      await page.goto('https://seller.wildberries.ru/analytics/stock-report', { wait_until: 'load' })
      for (const task of tasks) {
        try {
          logs.push(log(`Запуск задачи ${task.skuKey}`))
          const openBtn = page.locator('button:has-text("Перераспределить")').first()
          if (await openBtn.count()) await openBtn.click()
          const skuInput = page.locator('input[placeholder*="Артикул"], input[name="sku"]').first()
          if (await skuInput.count()) await skuInput.fill(String(task.skuKey))
          const qtyInput = page.locator('input[placeholder*="Колич"], input[name="qty"]').first()
          if (await qtyInput.count()) await qtyInput.fill(String(task.qty))
          const fromSelect = page.locator('select[name="fromWarehouse"]').first()
          if (await fromSelect.count()) await fromSelect.select_option(String(task.fromWarehouse))
          const toSelect = page.locator('select[name="toWarehouse"]').first()
          if (await toSelect.count()) await toSelect.select_option(String(task.toWarehouse))
          const submit = page.locator('button:has-text("Переместить"), button[type="submit"]').first()
          if (await submit.count()) await submit.click()
          await page.wait_for_timeout(1200)
          results.push({ ...task, status: 'success' })
          logs.push(log(`Успешно: ${task.skuKey}`))
        } catch (e) {
          results.push({ ...task, status: 'error', message: String(e?.message ?? e) })
          logs.push(log(`Ошибка: ${task.skuKey}`))
        }
      }
      return { status: 'ok', results, logs }
    } finally {
      await browser.close()
    }
  }
}
