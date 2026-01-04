import { BrowserManager } from './browserManager.js'

export class StockTransferService {
  constructor() {
    this.manager = new BrowserManager({ headless: true })
    this.session = null
    this.status = 'idle'
    this.logs = []
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

  async fetchStocksReport() {
    if (!this.session) {
      this.log('Нет активной сессии для парсинга отчета', 'error')
      return { status: 'error', message: 'no_session', rows: [], logs: this.logs }
    }

    this.log('Открываем отчет по остаткам')
    // Здесь должна быть реальная автоматизация страницы:
    // 1) открыть Аналитика → Отчёт по остаткам
    // 2) дождаться таблицы и спарсить данные
    // Пока возвращаем заглушку, но сохраняем структуру.
    return {
      status: 'ok',
      rows: [],
      logs: this.logs,
    }
  }

  async executeTransfers(tasks) {
    if (!this.session) {
      this.log('Нет активной сессии для отправки заявок', 'error')
      return { status: 'error', message: 'no_session', results: [], logs: this.logs }
    }
    const results = (tasks || []).map((task) => ({
      ...task,
      status: 'queued',
    }))
    this.log(`Поставлено в очередь задач: ${results.length}`)
    return { status: 'ok', results, logs: this.logs }
  }
}
