import { chromium } from 'playwright'

export class BrowserManager {
  constructor({ headless = true, logger = console }) {
    this.headless = headless
    this.logger = logger
  }

  async openWithStorage(storage) {
    const browser = await chromium.launch({ headless: this.headless })
    const context = await browser.new_context({ storage_state: storage })
    const page = await context.new_page()
    return { browser, context, page }
  }

  async openManualLogin({ timeoutMs = 180000, onSuccess } = {}) {
    this.logger.info('[BrowserManager] запуск ручного входа')
    const browser = await chromium.launch({ headless: false })
    const context = await browser.new_context()
    const page = await context.new_page()
    await page.goto('https://seller.wildberries.ru/', { wait_until: 'load' })
    const authSelector = 'nav, header, [data-menu], [class*="sidebar"], text=/аналитика/i'
    try {
      await page.wait_for_selector(authSelector, { timeout: timeoutMs })
      const storage = await context.storage_state()
      this.logger.info('[BrowserManager] ручной вход подтвержден')
      if (onSuccess) await onSuccess(storage)
      return { status: 'ok', storage }
    } catch (e) {
      this.logger.error('[BrowserManager] ручной вход не подтвержден', e)
      throw new Error('manual_login_timeout')
    } finally {
      await browser.close()
    }
  }

  async login({ login, password }) {
    this.logger.info('[BrowserManager] старт логина')
    const browser = await chromium.launch({ headless: this.headless })
    const context = await browser.new_context()
    const page = await context.new_page()

    try {
      await page.goto('https://seller.wildberries.ru/', { wait_until: 'load' })
      const loginInput = page.locator('input[name="login"], input[type="email"], input[type="text"]')
      const passInput = page.locator('input[name="password"], input[type="password"]')
      if (await loginInput.count()) await loginInput.first().fill(login)
      if (await passInput.count()) await passInput.first().fill(password)

      const submit = page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Продолжить")')
      if (await submit.count()) await submit.first().click()

      // Возможная captcha/2FA
      const captcha = page.locator('iframe[src*="captcha"], text=/капча/i')
      if (await captcha.count()) {
        this.logger.warn('[BrowserManager] обнаружена captcha, требуется ручное подтверждение')
      }

      await page.wait_for_timeout(2000)
      const storage = await context.storage_state()
      this.logger.info('[BrowserManager] логин завершен, сессия сохранена')
      return { status: 'ok', storage }
    } catch (e) {
      this.logger.error('[BrowserManager] ошибка логина', e)
      throw e
    } finally {
      await browser.close()
    }
  }
}
