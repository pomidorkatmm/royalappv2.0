import express from 'express'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'url'
import { startPhoneLogin, confirmPhoneLogin } from './stockTransfer/phoneAuth.js'
import { StockTransferService } from './stockTransfer/stockTransferService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(compression())
app.use(express.json())


app.post('/api/wb/login/start', async (req, res) => {
  try {
    const { phone } = req.body || {}
    if (!phone) return res.status(400).json({ error: 'phone_required' })
    const result = await startPhoneLogin(phone)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'login_failed', detail: String(e?.message ?? e) })
  }
})

app.post('/api/wb/login/confirm', async (req, res) => {
  try {
    const { sessionId, code } = req.body || {}
    if (!sessionId || !code) return res.status(400).json({ error: 'session_or_code_required' })
    const result = await confirmPhoneLogin(sessionId, code)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'confirm_failed', detail: String(e?.message ?? e) })
  }
})

const stockTransferService = new StockTransferService()

app.post('/api/wb/login/start', async (req, res) => {
  try {
    const { phone } = req.body || {}
    if (!phone) return res.status(400).json({ error: 'phone_required' })
    const result = await startPhoneLogin(phone)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'login_failed', detail: String(e?.message ?? e) })
  }
})

app.post('/api/wb/login/confirm', async (req, res) => {
  try {
    const { sessionId, code } = req.body || {}
    if (!sessionId || !code) return res.status(400).json({ error: 'session_or_code_required' })
    const result = await confirmPhoneLogin(sessionId, code)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'confirm_failed', detail: String(e?.message ?? e) })
  }
})

app.post('/api/stock-transfer/login', async (req, res) => {
  try {
    const { login, password } = req.body || {}
    if (!login || !password) return res.status(400).json({ error: 'login_or_password_required' })
    const result = await stockTransferService.login({ login, password })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'login_failed', detail: String(e?.message ?? e) })
  }
})

app.post('/api/stock-transfer/manual/start', async (_req, res) => {
  try {
    const result = await stockTransferService.startManualLogin()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'manual_login_failed', detail: String(e?.message ?? e) })
  }
})

app.get('/api/stock-transfer/manual/status', (req, res) => {
  const sessionId = String(req.query.sessionId || '')
  if (!sessionId) return res.status(400).json({ error: 'session_required' })
  const result = stockTransferService.getManualStatus(sessionId)
  res.json(result)
})

app.post('/api/stock-transfer/phone/start', async (req, res) => {
  try {
    const { phone } = req.body || {}
    if (!phone) return res.status(400).json({ error: 'phone_required' })
    const result = await stockTransferService.startPhoneLogin(phone)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'phone_start_failed', detail: String(e?.message ?? e) })
  }
})

app.post('/api/stock-transfer/phone/confirm', async (req, res) => {
  try {
    const { sessionId, code } = req.body || {}
    if (!sessionId || !code) return res.status(400).json({ error: 'session_or_code_required' })
    const result = await stockTransferService.confirmPhoneLogin(sessionId, code)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'phone_confirm_failed', detail: String(e?.message ?? e) })
  }
})

app.get('/api/stock-transfer/stocks', async (_req, res) => {
  try {
    const result = await stockTransferService.fetchStocksReport()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'stocks_failed', detail: String(e?.message ?? e) })
  }
})

app.post('/api/stock-transfer/execute', async (req, res) => {
  try {
    const { tasks } = req.body || {}
    const result = await stockTransferService.executeTransfers(tasks || [])
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: 'execute_failed', detail: String(e?.message ?? e) })
  }
})

// ---- Static фронтенд (после `npm run build`) ----
const distDir = path.resolve(__dirname, '..', 'dist')
app.use(express.static(distDir))

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = Number(process.env.PORT || 4173)
app.listen(port, () => {
  console.log(`WB feedbacks app running on http://localhost:${port}`)
})
