import { chromium } from 'playwright'

const sessions = new Map()

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`
  if (digits.length === 10) return `+7${digits}`
  if (digits.startsWith('8') && digits.length === 11) return `+7${digits.slice(1)}`
  return null
}

async function readInlineError(page) {
  const errorNode = page.locator('[class*="error"], text=/неверн|ошиб|код|запрашив/i')
  if (await errorNode.count()) {
    return (await errorNode.first().text_content())?.trim() || null
  }
  return null
}

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export async function startPhoneLogin(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) throw new Error('invalid_phone_format')

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
  await phoneInput.first().fill(normalized)
  await phoneInput.first().dispatch_event('input')
  await phoneInput.first().dispatch_event('change')
  const submit = page.locator('button:has-text("Получить код"), button:has-text("Получить SMS"), button[type="submit"]')
  if (!(await submit.count())) {
    await browser.close()
    throw new Error('sms_button_not_found')
  }
  await submit.first().click()

  const codeInput = page.locator('input[autocomplete="one-time-code"], input[name="code"], input[type="tel"]')
  try {
    await codeInput.first().wait_for({ timeout: 15000 })
  } catch {
    const errorText = await readInlineError(page)
    if (errorText) {
      await browser.close()
      throw new Error(errorText)
    }
    await browser.close()
    throw new Error('code_input_not_found')
  }

  sessions.set(sessionId, { browser, context, page, lastRequestMs: Date.now() })
  return { sessionId, status: 'code_required', phone: normalized }
}

export async function confirmPhoneLogin(sessionId, code) {
  const session = sessions.get(sessionId)
  if (!session) return { status: 'error', message: 'session_not_found' }

  const { browser, context, page } = session
  const codeInput = page.locator('input[autocomplete="one-time-code"], input[name="code"], input[type="tel"]')
  if (!(await codeInput.count())) {
    await browser.close()
    sessions.delete(sessionId)
    return { status: 'error', message: 'code_input_not_found' }
  }
  await codeInput.first().fill(String(code || ''))
  await codeInput.first().dispatch_event('input')
  await codeInput.first().dispatch_event('change')

  const submit = page.locator('button:has-text("Подтвердить"), button[type="submit"]')
  if (await submit.count()) await submit.first().click()

  try {
    await page.wait_for_url(/seller\.wildberries\.ru\/(?!login)/, { timeout: 15000 })
  } catch {
    const errorText = await readInlineError(page)
    if (errorText) {
      await browser.close()
      sessions.delete(sessionId)
      return { status: 'error', message: errorText }
    }
  }
  const storage = await context.storage_state()
  await browser.close()
  sessions.delete(sessionId)
  return { status: 'ok', storage }
}
