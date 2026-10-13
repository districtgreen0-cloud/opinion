import { useEffect } from 'react'
import { useStore } from '../store'
import { cityData, randomComment, randomCrewMessage } from '../data/mock'
import { LIVE, fetchFeed, fetchJobs } from '../lib/api'
import { km } from '../lib/format'

const between = (a: number, b: number) => a + Math.random() * (b - a)

/** Streams fake-but-plausible life into the city. In live mode the feed comes from the worker instead. */
export function useMockRealtime() {
  const cityId = useStore((s) => s.city.id)

  useEffect(() => {
    if (LIVE) {
      fetchFeed().then((list) => list?.forEach((c) => useStore.getState().addComment(c)))
      fetchJobs().then((list) => list?.forEach((c) => useStore.getState().upsertPost(c)))
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: ReturnType<typeof setTimeout>[] = []

    const comment = () => {
      const s = useStore.getState()
      const d = cityData(s.city)
      const cells = [...d.hexActivity.entries()].filter(([, a]) => a > 0.2).map(([c]) => c)
      if (!LIVE && cells.length) s.addComment(randomComment(cells[Math.floor(Math.random() * cells.length)]))
      timers.push(setTimeout(comment, between(4000, 7000) * (reduced ? 2 : 1)))
    }
    const crew = () => {
      const s = useStore.getState()
      const d = cityData(s.city)
      const target = s.crewEventId ?? d.events[Math.floor(Math.random() * 3)].id
      s.addCrewMessage(randomCrewMessage(target))
      timers.push(setTimeout(crew, between(6000, 10000)))
    }
    // "you are earning": +1 pt every 3s while your radar overlaps activity
    const earn = () => {
      const s = useStore.getState()
      if (s.pos && isEarning()) s.award(1)
      timers.push(setTimeout(earn, 3000))
    }
    timers.push(setTimeout(comment, 2500), setTimeout(crew, 5000), setTimeout(earn, 3000))
    return () => timers.forEach(clearTimeout)
  }, [cityId])
}

export function isEarning(): boolean {
  const s = useStore.getState()
  if (!s.pos) return false
  const d = cityData(s.city)
  return d.events.some((e) => km(s.pos!.lat, s.pos!.lng, e.lat, e.lng) < 0.6)
}
