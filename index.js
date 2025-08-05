import express from 'express'
import { HLTV } from 'hltv'

const app = express()
const cache = new Map()
const TTL = 10_000 


app.use((_, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  next()
})


app.get('/health', (_, res) => res.send('ok'))

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
    const match = await HLTV.getMatch({ id })

    let left = 0, right = 0
    for (const m of (match.maps || [])) {
      if (!m?.winnerTeam) continue
      if (m.winnerTeam.id === match.team1?.id) left++
      else if (m.winnerTeam.id === match.team2?.id) right++
    }

    let rounds = null
    const liveMap = (match.maps || []).find(m => m.status === 'live' || m.live)
    if (liveMap) {
      if (typeof liveMap.team1Score === 'number' && typeof liveMap.team2Score === 'number') {
        rounds = { left: liveMap.team1Score, right: liveMap.team2Score }
      } else if (liveMap.currentScore) {
        rounds = liveMap.currentScore
      }
    }

    const payload = {
      teams: { left: match.team1?.name, right: match.team2?.name },
      series: { left, right },
      rounds,
      mapNumber: (match.maps || []).filter(m => m.winnerTeam || m.status === 'live' || m.live).length || 1,
      live: !!match.live
    }

    cache.set(key, { t: now, v: payload })
    res.json(payload)
  } catch (e) {

    console.error('HLTV error:', e?.message || e)
    res.status(500).json({ error: 'hltv failed' })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log('HLTV proxy listening on', PORT))
