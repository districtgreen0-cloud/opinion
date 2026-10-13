import { latLngToCell } from 'h3-js'
import { H3_RES } from './h3'

/**
 * Google location history → hex footprint. Runs fully on-device; nothing is uploaded.
 *
 * Handles every export Google has shipped:
 *  - Takeout "Records.json"              { locations: [{ latitudeE7, longitudeE7, timestamp }] }
 *  - Takeout "Semantic Location History" { timelineObjects: [{ placeVisit: { location: { latitudeE7, longitudeE7, name } } }] }
 *  - On-device Timeline export (Android) { semanticSegments: [{ visit: { topCandidate: { placeLocation: { latLng: "45.25°, 19.84°" } } } }] }
 *  - On-device Timeline export (iOS)     [{ visit: { topCandidate: { placeLocation: "geo:45.25,19.84" } } }, { timelinePath: [{ point: "geo:…" }] }]
 * Rather than special-casing each schema, it walks the JSON and recognises the three coordinate encodings.
 */

export type FootprintPlace = { cell: string; lat: number; lng: number; name: string; visits: number }
export type Footprint = {
  res: number // H3 resolution the cells were built at
  cells: Record<string, number> // cell → weight
  places: FootprintPlace[]
  points: number
  from: number | null
  to: number | null
  importedAt: number
}

const DEG = /^\s*(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)°?\s*$/
const GEO = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/

function parseCoord(v: unknown): [number, number] | null {
  if (typeof v !== 'string') return null
  const m = GEO.exec(v) ?? (v.includes('°') ? DEG.exec(v) : null)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null
}

function parseTime(o: Record<string, unknown>): number | null {
  const t = o.timestamp ?? o.time ?? o.startTime ?? o.endTime ?? o.startTimestamp ?? o.endTimestamp ?? o.timestampMs
  if (typeof t === 'string') {
    const n = /^\d+$/.test(t) ? Number(t) : Date.parse(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const RES = H3_RES
const VISIT_WEIGHT = 6 // a stop counts more than a GPS ping passing by

export function buildFootprint(jsons: unknown[]): Footprint {
  const cells: Record<string, number> = {}
  const visits = new Map<string, { lat: number; lng: number; names: Map<string, number>; visits: number }>()
  let points = 0
  let from: number | null = null
  let to: number | null = null

  const add = (lat: number, lng: number, isVisit: boolean, name?: string) => {
    const cell = latLngToCell(lat, lng, RES)
    cells[cell] = (cells[cell] ?? 0) + (isVisit ? VISIT_WEIGHT : 1)
    points++
    if (!isVisit) return
    const v = visits.get(cell) ?? { lat, lng, names: new Map(), visits: 0 }
    v.visits++
    if (name) v.names.set(name, (v.names.get(name) ?? 0) + 1)
    visits.set(cell, v)
  }
  const stamp = (o: Record<string, unknown>) => {
    const t = parseTime(o)
    if (t === null) return
    if (from === null || t < from) from = t
    if (to === null || t > to) to = t
  }

  // iterative walk — Records.json can hold millions of nodes
  const stack: { node: unknown; visit: boolean; name?: string }[] = jsons.map((node) => ({ node, visit: false }))
  while (stack.length) {
    const { node, visit, name } = stack.pop()!
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push({ node: node[i], visit, name })
      continue
    }
    if (!node || typeof node !== 'object') {
      const c = parseCoord(node)
      if (c) add(c[0], c[1], visit, name)
      continue
    }
    const o = node as Record<string, unknown>
    stamp(o)
    if (typeof o.latitudeE7 === 'number' && typeof o.longitudeE7 === 'number') {
      const n = typeof o.name === 'string' ? o.name : name
      add(o.latitudeE7 / 1e7, o.longitudeE7 / 1e7, visit, n)
      continue
    }
    for (const [k, v] of Object.entries(o)) {
      // device noise, profile, and Google's rejected guesses for a visit are not places you were
      if (k === 'rawSignals' || k === 'userLocationProfile' || k === 'otherCandidateLocations' || k === 'candidateLocations') continue
      const isVisit = visit || k === 'placeVisit' || k === 'visit'
      const nm = typeof (v as Record<string, unknown>)?.name === 'string' ? ((v as Record<string, unknown>).name as string) : name
      stack.push({ node: v, visit: isVisit, name: nm })
    }
  }

  const places: FootprintPlace[] = [...visits.entries()]
    .map(([cell, v]) => {
      const best = [...v.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      return { cell, lat: v.lat, lng: v.lng, name: best ?? '', visits: v.visits }
    })
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 400)

  return { res: RES, cells, places, points, from, to, importedAt: Date.now() }
}
