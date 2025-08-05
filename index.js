import express from 'express'
import cloudscraper from 'cloudscraper'
import pkg from 'hltv'
const { parseMatch } = pkg

const app = express()
const cache = new Map()
const TTL = 10_000 // 10 секунд кешу

// CORS
app.use((_, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  next()
})

// Healthcheck
app.get('/health', (_, res) => res.send('ok'))

// Endpoint для live-даних
app.get('/hltv/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'bad id' })

  const key = 'm_' + id
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.t < TTL) {
    return res.json(cached.v)
  }

  try {
    // 1) Завантажуємо HTML через cloudscraper (обхід Cloudflare)
    const url = `https://www.hltv.org/matches/${id}/`
    const html = await cloudscraper({ uri: url, method: 'GET' })

    // 2) Парсимо отриманий HTML
    const match = parseMatch(html)

    // Рахуємо виграні карти
    let left = 0, right = 0
    for (const m of (match.maps || [])) {
      if (!m?.winnerTeam) continue
      if (m.winnerTeam.id === match.team1?.id) left++
      else if (m.winnerTeam.id === match.team2?.id) right++
    }

    // Отримуємо live-раунди
    let rounds = null
    const liveMap = (match.maps || []).find(m => m.status === 'live' || m.live)
    if (liveMap) {
      if (typeof liveMap.team1Score === 'number' && typeof liveMap.team2Score === 'number') {
        rounds = { left: liveMap.team1Score, right: liveMap.team2Score }
      } else if (liveMap.currentScore) {
        rounds = liveMap.currentScore
      }
    }

    // Формуємо результат
    const payload = {
      teams: { left: match.team1?.name, right: match.team2?.name },
      series: { left, right },
      rounds,
      mapNumber: (match.maps || []).filter(m => m.winnerTeam || m.status === 'live' || m.live).length || 1,
      live: !!match.live
    }

    // Кешуємо й повертаємо
    cache.set(key, { t: now, v: payload })
    res.json(payload)

  } catch (e) {
    console.error('HLTV proxy error:', e)
    res.status(500).json({
      error:  'hltv failed',
      detail: e?.message || String(e)
    })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log('HLTV proxy listening on', PORT))
