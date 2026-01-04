import { chromium } from 'playwright'

const sessions = new Map()

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export async function startPhoneLogin(phone) {
  const sessionId = newId()
  const headless = process.env.WB_HEADLESS !== 'false'
  const browser = await chromium.launch({ headless })
  const context = await browser.new_context()
  const page = await context.new_page()

  await page.goto('https://seller.wildberries.ru/', { wait_until: 'load' })
  const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[name="login"]')
  if (!(await phoneInput.count())) {
    await browser.close()
    throw new Error('phone_input_not_found')
  }
  await phoneInput.first().fill(phone)
  const submit = page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Продолжить")')
  if (await submit.count()) await submit.first().click()

  sessions.set(sessionId, { browser, context, page })
  return { sessionId, status: 'code_required' }
}

export async function confirmPhoneLogin(sessionId, code) {
  const session = sessions.get(sessionId)
  if (!session) return { status: 'error', message: 'session_not_found' }

  const { browser, context, page } = session
  const codeInput = page.locator('input[type="tel"], input[name="code"], input[autocomplete="one-time-code"]')
  if (await codeInput.count()) {
    await codeInput.first().fill(code)
  }
  const submit = page.locator('button[type="submit"], button:has-text("Подтвердить")')
  if (await submit.count()) {
    await submit.first().click()
  }
  await page.wait_for_timeout(1500)
  const storage = await context.storage_state()
  await browser.close()
  sessions.delete(sessionId)
  return { status: 'ok', storage }
}
