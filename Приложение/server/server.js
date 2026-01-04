import express from 'express'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'url'

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
