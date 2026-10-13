import { useEffect } from 'react'
import { useStore } from '../store'
import { LIVE } from '../lib/api'
import type { Game } from '../lib/types'

const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = LIVE ? (RAW ?? '').replace(/\/$/, '') : ''

/** Real fixtures at the city's stadiums (ESPN + TheSportsDB via the worker). Refreshes every 2 min while a game is live. */
export function useSportsFeed() {
  const cityId = useStore((s) => s.city.id)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const pull = async () => {
      let live = false
      try {
        const r = await fetch(`${BASE}/api/feeds/sports?city=${cityId}`, { headers: { accept: 'application/json' } })
        if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
          const data = (await r.json()) as { games?: Game[] }
          const games = data.games ?? []
          live = games.some((g) => g.state === 'live')
          if (!cancelled) useStore.getState().setGames(cityId, games)
        }
      } catch {
        /* offline / dev without the feeds worker → venues only */
      }
      if (!cancelled) timer = setTimeout(pull, live ? 120_000 : 600_000)
    }
    pull()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cityId])
}
