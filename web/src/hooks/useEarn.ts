import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { coarseCell, flush, record } from '../lib/earn'

const PRESENCE_MS = 5 * 60_000

/** Runs Earn mode while consented and not paused: presence pings, interest opens, post kinds, batched upload. */
export function useEarn() {
  const consent = useStore((s) => s.earnConsent)
  const paused = useStore((s) => s.earnPaused)
  const on = !!consent && !paused
  const tiers = consent?.tiers

  // presence: one coarse ping per 5 min while the app is open and visible
  useEffect(() => {
    if (!on || !tiers?.presence) return
    const tick = () => {
      const s = useStore.getState()
      if (document.hidden || !s.pos) return
      record({ tier: 'presence', kind: 'dwell', cell: coarseCell(s.pos.lat, s.pos.lng), t: Date.now() })
      s.addEarnPoints(1)
    }
    tick()
    const id = setInterval(tick, PRESENCE_MS)
    return () => clearInterval(id)
  }, [on, tiers?.presence])

  // interests: first open of a category per day
  const seen = useRef(new Set<string>())
  const homeFilter = useStore((s) => s.homeFilter)
  useEffect(() => {
    if (!on || !tiers?.interests || homeFilter === 'all') return
    const key = new Date().toDateString() + homeFilter
    if (seen.current.has(key)) return
    seen.current.add(key)
    record({ tier: 'interests', kind: 'follow', t: Date.now(), value: homeFilter })
    useStore.getState().addEarnPoints(1)
  }, [on, tiers?.interests, homeFilter])

  // observations: the kind of each new post of yours (never its text)
  const lastPost = useRef<string | null>(null)
  const comments = useStore((s) => s.comments)
  useEffect(() => {
    const s = useStore.getState()
    const mine = comments.find((c) => c.handle === s.me.handle && (c.kind ?? 'note') !== 'reply')
    if (!mine || mine.id === lastPost.current) return
    const first = lastPost.current === null
    lastPost.current = mine.id
    if (first || !on || !tiers?.observations || !s.pos) return
    record({ tier: 'observations', kind: 'post', cell: coarseCell(s.pos.lat, s.pos.lng), t: Date.now(), value: mine.kind ?? 'note' })
  }, [comments, on, tiers?.observations])

  // upload (live mode only) once a minute and when leaving
  useEffect(() => {
    if (!on) return
    const id = setInterval(flush, 60_000)
    const bye = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', bye)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bye)
    }
  }, [on])
}
