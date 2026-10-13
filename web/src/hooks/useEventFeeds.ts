import { useEffect } from 'react'
import { useStore } from '../store'
import { addExternalEvents } from '../data/mock'
import { LIVE } from '../lib/api'
import type { VEvent } from '../lib/types'

const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = LIVE ? (RAW ?? '').replace(/\/$/, '') : '' // demo + share preview: same-origin worker
const PHONE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820

/** Pull real upcoming events (Luma iCal, optional Eventbrite) for the current city and drop them on the map. */
export function useEventFeeds() {
  const cityId = useStore((s) => s.city.id)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${BASE}/api/feeds/events?city=${cityId}`, { headers: { accept: 'application/json' } })
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return
        const data = (await r.json()) as { events?: (VEvent & { source: 'luma' | 'eventbrite' })[]; sources?: Record<string, number | string> }
        const list = (data.events ?? []).slice(0, PHONE ? 20 : 40) // fewer 3D beacons on phones
        if (cancelled || !list.length) return
        const added = addExternalEvents(cityId, list)
        const s = useStore.getState()
        s.setFeedInfo(cityId, { count: list.length, sources: data.sources ?? {}, at: Date.now() })
        if (added && s.city.id === cityId) s.refreshCity()
      } catch {
        /* offline / dev without the feeds worker → mock events only */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cityId])
}
