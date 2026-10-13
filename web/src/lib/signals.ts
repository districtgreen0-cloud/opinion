import data from '../data/signals.json'
import type { City } from './types'

/**
 * Traffic lights: real positions (OSM highway=traffic_signals), SIMULATED phases (no city publishes live timing).
 * Signal heads within ~25 m form a junction; heads on one road axis are green while the cross axis is red.
 */
export type Signal = { lng: number; lat: number; offset: number; axis: 0 | 1 }

const CYCLE = 48 // seconds: 20 green · 3 amber · 1 all-red, then the cross axis gets its turn
const GREEN = 20
const AMBER = 3

const cache = new Map<string, Signal[]>()

export function citySignals(id: City['id']): Signal[] {
  const hit = cache.get(id)
  if (hit) return hit
  const pts = ((data as unknown as { cities: Record<string, [number, number][]> }).cities[id] ?? []) as [number, number][]
  // grid-cluster into junctions (~25 m cells), then assign axis by bearing from the junction centre
  const cell = (x: number) => Math.round(x / 0.00028)
  const groups = new Map<string, [number, number][]>()
  for (const p of pts) {
    const k = `${cell(p[0])}:${cell(p[1])}`
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const out: Signal[] = []
  let j = 0
  for (const g of groups.values()) {
    const cx = g.reduce((a, p) => a + p[0], 0) / g.length
    const cy = g.reduce((a, p) => a + p[1], 0) / g.length
    const offset = ((j++ * 7.31) % CYCLE) // stagger junctions so the city doesn't blink in sync
    for (const [lng, lat] of g) {
      const dx = (lng - cx) * Math.cos((lat * Math.PI) / 180)
      const dy = lat - cy
      out.push({ lng, lat, offset, axis: Math.abs(dx) >= Math.abs(dy) ? 0 : 1 })
    }
  }
  cache.set(id, out)
  return out
}

export type Phase = 'green' | 'amber' | 'red'
export function phaseAt(s: Signal, tSec: number): Phase {
  const local = (tSec + s.offset + (s.axis ? CYCLE / 2 : 0)) % CYCLE
  if (local < GREEN) return 'green'
  if (local < GREEN + AMBER) return 'amber'
  return 'red'
}
export const PHASE_RGB: Record<Phase, [number, number, number]> = { green: [20, 241, 149], amber: [255, 196, 0], red: [255, 59, 48] }
export const SIGNALS_ATTRIBUTION = 'Traffic-light positions © OpenStreetMap · phases simulated'
