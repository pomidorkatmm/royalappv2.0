import express from 'express'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(compression())


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
