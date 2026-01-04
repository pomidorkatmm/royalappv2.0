import { BrowserManager } from './browserManager.js'
import { startPhoneLogin, confirmPhoneLogin } from './phoneAuth.js'

export class StockTransferService {
  constructor() {
    this.manager = new BrowserManager({ headless: true })
    this.session = null
    this.status = 'idle'
    this.logs = []
    this.manualSessionId = null
  }

  log(message, level = 'info') {
    const entry = { ts: new Date().toISOString(), level, message }
    this.logs.push(entry)
    if (level === 'error') console.error('[StockTransfer]', message)
    else console.log('[StockTransfer]', message)
  }

  async login({ login, password }) {
    this.status = 'loading'
    this.log('Старт авторизации в seller.wildberries.ru')
    try {
      const result = await this.manager.login({ login, password })
      this.session = result.storage
      this.status = 'ok'
      this.log('Авторизация успешна')
      return { status: 'ok' }
    } catch (e) {
      this.status = 'error'
      this.log(`Ошибка входа: ${String(e?.message ?? e)}`, 'error')
      throw e
    }
  }

  async startManualLogin() {
    this.status = 'loading'
    this.log('Открываем браузер для ручного входа')
    try {
      const manualId = `${Date.now()}_${Math.random().toString(16).slice(2)}`
      this.manualSessionId = manualId
      this.manager.openManualLogin({
        timeoutMs: 180000,
        onSuccess: async (storage) => {
          this.session = storage
          this.status = 'ok'
          this.log('Авторизация вручную подтверждена')
        },
      }).catch((e) => {
        this.status = 'error'
        this.log(`Ошибка ручного входа: ${String(e?.message ?? e)}`, 'error')
      })
      return { status: 'pending', sessionId: manualId }
    } catch (e) {
      this.status = 'error'
      this.log(`Ошибка ручного входа: ${String(e?.message ?? e)}`, 'error')
      throw e
    }
  }

  getManualStatus(sessionId) {
    if (!this.manualSessionId || this.manualSessionId !== sessionId) {
      return { status: 'error', message: 'session_not_found' }
    }
    return { status: this.status }
  }

  async startPhoneLogin(phone) {
    this.status = 'loading'
    this.log('Запрос SMS-кода для входа')
    const result = await startPhoneLogin(phone)
    this.log('SMS-код отправлен')
    return result
  }

  async confirmPhoneLogin(sessionId, code) {
    this.status = 'loading'
    this.log('Подтверждение SMS-кода')
    const result = await confirmPhoneLogin(sessionId, code)
    if (result?.storage) {
      this.session = result.storage
      this.status = 'ok'
      this.log('Авторизация по телефону успешна')
    }
    return result
  }

  async fetchStocksReport() {
    if (!this.session) {
      this.log('Нет активной сессии для парсинга отчета', 'error')
      return { status: 'error', message: 'no_session', rows: [], logs: this.logs }
    }

    this.log('Открываем отчет по остаткам')
    const { browser, page } = await this.manager.openWithStorage(this.session)
    try {
      await page.goto('https://seller.wildberries.ru/', { wait_until: 'load' })
      await page.goto('https://seller.wildberries.ru/analytics/stock-report', { wait_until: 'load' })

      const table = page.locator('table')
      await table.first().wait_for({ timeout: 15000 })
      const rows = await page.evaluate(() => {
        const data = []
        const table = document.querySelector('table')
        if (!table) return data
        const body = table.querySelector('tbody')
        if (!body) return data
        for (const tr of Array.from(body.querySelectorAll('tr'))) {
          const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() || '')
          if (cells.length > 0) data.push(cells)
        }
        return data
      })
      this.log(`Строк отчёта: ${rows.length}`)
      return { status: 'ok', rows, logs: this.logs }
    } catch (e) {
      this.log(`Ошибка отчёта: ${String(e?.message ?? e)}`, 'error')
      return { status: 'error', message: 'report_failed', rows: [], logs: this.logs }
    } finally {
      await browser.close()
    }
  }

  async executeTransfers(tasks) {
    if (!this.session) {
      this.log('Нет активной сессии для отправки заявок', 'error')
      return { status: 'error', message: 'no_session', results: [], logs: this.logs }
    }
    const { browser, page } = await this.manager.openWithStorage(this.session)
    const results = []
    try {
      await page.goto('https://seller.wildberries.ru/', { wait_until: 'load' })
      await page.goto('https://seller.wildberries.ru/analytics/stock-report', { wait_until: 'load' })

      for (const task of tasks || []) {
        try {
          const action = page.locator('button:has-text("Перераспределить")')
          if (await action.count()) await action.first().click()
          const skuInput = page.locator('input[name="sku"], input[placeholder*="Артикул"]')
          if (await skuInput.count()) await skuInput.first().fill(String(task.skuKey))
          const qtyInput = page.locator('input[name="qty"], input[placeholder*="Колич"]')
          if (await qtyInput.count()) await qtyInput.first().fill(String(task.qty))
          const fromSelect = page.locator('select[name="fromWarehouse"]')
          if (await fromSelect.count()) await fromSelect.first().select_option(String(task.fromWarehouse))
          const toSelect = page.locator('select[name="toWarehouse"]')
          if (await toSelect.count()) await toSelect.first().select_option(String(task.toWarehouse))
          const submit = page.locator('button[type="submit"], button:has-text("Переместить")')
          if (await submit.count()) await submit.first().click()
          await page.wait_for_timeout(1200)
          results.push({ ...task, status: 'sent' })
          this.log(`Заявка отправлена: ${task.skuKey}`)
        } catch (e) {
          results.push({ ...task, status: 'error', message: String(e?.message ?? e) })
          this.log(`Ошибка заявки: ${task.skuKey}`, 'error')
        }
      }
      return { status: 'ok', results, logs: this.logs }
    } finally {
      await browser.close()
    }
  }
}
