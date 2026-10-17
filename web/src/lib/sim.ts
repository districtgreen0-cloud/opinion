import type { City } from './types'
import { cityMajors } from './sports'

/**
 * User-load simulation: N users split across OPINION cities by population, spread over each whole town.
 * Density = a broad city-wide spread + clusters around real hotspots (stadiums, arenas, junctions) + a hot core.
 * Deterministic (seeded) so the same city/size always looks the same. Visual only: nothing is sent anywhere.
 */
export type SimSize = 10_000 | 1_000_000

// resident population (city proper / core area) → share of simulated users
const POP: Record<City['id'], { pop: number; radiusKm: number }> = {
  ldn: { pop: 9_650_000, radiusKm: 17 },
  nyc: { pop: 8_300_000, radiusKm: 15 },
  sf: { pop: 810_000, radiusKm: 6.5 },
  bgd: { pop: 1_690_000, radiusKm: 9 },
  ns: { pop: 370_000, radiusKm: 5 },
}
const TOTAL = Object.values(POP).reduce((a, c) => a + c.pop, 0)
export const simShare = (id: City['id']) => POP[id].pop / TOTAL
export const simCount = (id: City['id'], size: SimSize) => Math.round(size * simShare(id))

const PHONE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820
export const RENDER_CAP = PHONE ? 120_000 : 600_000

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())

const cache = new Map<string, { positions: Float32Array; count: number; drawn: number }>()

/** Positions (lng,lat pairs) for one city. `drawn` ≤ count (phones draw a sample). */
export function simPoints(city: City, size: SimSize) {
  const key = `${city.id}:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const count = simCount(city.id, size)
  const drawn = Math.min(count, RENDER_CAP)
  const r = rng([...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
  const { radiusKm } = POP[city.id]
  const [clng, clat] = city.center
  const kmLat = 1 / 110.574
  const kmLng = 1 / (111.32 * Math.cos((clat * Math.PI) / 180))
  // hotspots: venues (stadiums, arenas, sports centres) plus seeded street-corner clusters
  const spots: [number, number, number][] = []
  for (const m of cityMajors(city.id)) spots.push([m.p[0], m.p[1], m.k <= 1 ? 0.7 : 0.35])
  for (let i = 0; i < 120; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radiusKm * 0.6
    spots.push([clng + Math.cos(a) * d * kmLng, clat + Math.sin(a) * d * kmLat, 0.25])
  }
  const pos = new Float32Array(drawn * 2)
  for (let i = 0; i < drawn; i++) {
    const u = r()
    let lng: number
    let lat: number
    if (u < 0.45 || !spots.length) {
      // city-wide spread (people live everywhere), falling off toward the edge
      const d = Math.abs(gauss(r)) * radiusKm * 0.45
      const a = r() * Math.PI * 2
      lng = clng + Math.cos(a) * d * kmLng
      lat = clat + Math.sin(a) * d * kmLat
    } else if (u < 0.6) {
      // hot core (centre, nightlife, offices)
      lng = clng + gauss(r) * radiusKm * 0.09 * kmLng
      lat = clat + gauss(r) * radiusKm * 0.09 * kmLat
    } else {
      // clusters around real places
      const sp = spots[Math.floor(r() * spots.length)]!
      const s = 0.12 + sp[2] * 0.35 // km
      lng = sp[0] + gauss(r) * s * kmLng
      lat = sp[1] + gauss(r) * s * kmLat
    }
    pos[i * 2] = lng
    pos[i * 2 + 1] = lat
  }
  const out = { positions: pos, count, drawn }
  cache.set(key, out)
  return out
}

/** Zoom that fits the whole simulated town on this screen. */
export function simZoom(city: City) {
  const mpp = (POP[city.id].radiusKm * 2000) / (Math.min(innerWidth, innerHeight) * 0.9)
  return Math.log2((156543 * Math.cos((city.center[1] * Math.PI) / 180)) / mpp)
}

export const fmtUsers = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n))
