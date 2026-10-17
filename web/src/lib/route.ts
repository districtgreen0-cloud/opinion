/**
 * Turn-by-turn routing on OpenStreetMap data (FOSSGIS OSRM server, routing.openstreetmap.de: free, fair use).
 * For production volume: self-host OSRM/Valhalla or use a paid router; the shape below stays the same.
 */
export type NavMode = 'foot' | 'bike' | 'car'
export type LngLat = [number, number]
export type Step = { text: string; icon: string; dist: number; duration: number; name: string; at: LngLat; startAlong: number }
export type Route = { coords: LngLat[]; cum: number[]; distance: number; duration: number; steps: Step[]; mode: NavMode }

const PROFILE: Record<NavMode, string> = { foot: 'routed-foot', bike: 'routed-bike', car: 'routed-car' }
export const MODE_LABEL: Record<NavMode, string> = { foot: '🚶 Walk', bike: '🚲 Bike', car: '🚗 Car' }

const R = 6371000
export function meters(a: LngLat, b: LngLat) {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
export function bearing(a: LngLat, b: LngLat) {
  const φ1 = (a[1] * Math.PI) / 180
  const φ2 = (b[1] * Math.PI) / 180
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

type OsrmStep = { distance: number; duration: number; name: string; ref?: string; destinations?: string; maneuver: { type: string; modifier?: string; location: LngLat; exit?: number } }
/** "A4 · Great West Road" — road number + name when OSRM knows both */
const roadName = (s: OsrmStep) => [s.ref, s.name].filter(Boolean).join(' · ') || (s.destinations ? `towards ${s.destinations}` : '')

const ARROW: Record<string, string> = { left: '←', 'slight left': '↖', 'sharp left': '↰', right: '→', 'slight right': '↗', 'sharp right': '↱', straight: '↑', uturn: '↶' }
function sentence(s: OsrmStep, i: number, last: boolean): { text: string; icon: string } {
  const m = s.maneuver
  const rn = roadName(s)
  const onto = rn ? ` onto ${rn}` : ''
  const dir = m.modifier ?? 'straight'
  if (i === 0) return { text: `Head out${rn ? ` on ${rn}` : ''}`, icon: '↑' }
  if (last || m.type === 'arrive') return { text: 'Arrive at your destination', icon: '◎' }
  if (m.type === 'roundabout' || m.type === 'rotary') return { text: `At the roundabout take exit ${m.exit ?? 1}${onto}`, icon: '⟳' }
  if (dir === 'uturn') return { text: `Make a U-turn${onto}`, icon: ARROW.uturn! }
  if (m.type === 'continue' || dir === 'straight') return { text: `Continue${onto || ' straight'}`, icon: '↑' }
  const verb = dir.startsWith('slight') ? 'Bear' : 'Turn'
  return { text: `${verb} ${dir.replace('slight ', '').replace('sharp ', 'sharp ')}${onto}`, icon: ARROW[dir] ?? '↑' }
}

export async function fetchRoute(from: LngLat, to: LngLat, mode: NavMode, signal?: AbortSignal): Promise<Route> {
  const url = `https://routing.openstreetmap.de/${PROFILE[mode]}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error('route_http_' + r.status)
  const d = (await r.json()) as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: LngLat[] }; legs: { steps: OsrmStep[] }[] }[] }
  const best = d.routes?.[0]
  if (d.code !== 'Ok' || !best) throw new Error('no_route')
  const coords = best.geometry.coordinates
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + meters(coords[i - 1]!, coords[i]!))
  const raw = best.legs[0]?.steps ?? []
  // where along the line each manoeuvre happens (nearest vertex)
  let k = 0
  const steps: Step[] = raw.map((s, i) => {
    let bestJ = k
    let bestD = Infinity
    for (let j = k; j < coords.length; j++) {
      const dd = meters(coords[j]!, s.maneuver.location)
      if (dd < bestD) {
        bestD = dd
        bestJ = j
      }
      if (dd > bestD + 400) break
    }
    k = bestJ
    return { ...sentence(s, i, i === raw.length - 1), dist: s.distance, duration: s.duration, name: roadName(s), at: s.maneuver.location, startAlong: cum[bestJ]! }
  })
  return { coords, cum, distance: best.distance, duration: best.duration, steps, mode }
}

/** Where are we on the route? Distance along it, and how far off the line we are. */
export function progress(route: Route, p: LngLat): { along: number; off: number; idx: number } {
  let best = { along: 0, off: Infinity, idx: 0 }
  const cosLat = Math.cos((p[1] * Math.PI) / 180)
  for (let i = 0; i < route.coords.length - 1; i++) {
    const a = route.coords[i]!
    const b = route.coords[i + 1]!
    // project onto segment in a local metric frame
    const ax = (a[0] - p[0]) * cosLat * 111320
    const ay = (a[1] - p[1]) * 110540
    const bx = (b[0] - p[0]) * cosLat * 111320
    const by = (b[1] - p[1]) * 110540
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const off = Math.hypot(ax + t * dx, ay + t * dy)
    if (off < best.off) best = { off, along: route.cum[i]! + t * (route.cum[i + 1]! - route.cum[i]!), idx: i }
  }
  return best
}

/** Point at distance `along` (for the simulator and look-ahead bearing). */
export function pointAt(route: Route, along: number): LngLat {
  const c = route.cum
  if (along <= 0) return route.coords[0]!
  if (along >= c[c.length - 1]!) return route.coords[route.coords.length - 1]!
  let i = 1
  while (c[i]! < along) i++
  const t = (along - c[i - 1]!) / (c[i]! - c[i - 1]! || 1)
  const a = route.coords[i - 1]!
  const b = route.coords[i]!
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.max(5, Math.round(m / 10) * 10)} m`)
export const fmtDur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`)

/** Main roads of a route, longest first (for a "via …" line). */
export function viaRoads(route: Route, n = 3): string[] {
  const by = new Map<string, number>()
  for (const st of route.steps) if (st.name) by.set(st.name, (by.get(st.name) ?? 0) + st.dist)
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

// ── places: search + reverse lookup (Photon, OpenStreetMap data, free / fair use)
export type Place = { name: string; detail: string; at: LngLat }
type PhotonFeature = { geometry: { coordinates: LngLat }; properties: { name?: string; street?: string; housenumber?: string; city?: string; district?: string; state?: string; country?: string; osm_value?: string; postcode?: string } }
const placeOf = (f: PhotonFeature): Place => {
  const p = f.properties
  const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || 'Unnamed place'
  const detail = [p.street && p.name ? [p.street, p.housenumber].filter(Boolean).join(' ') : null, p.district, p.city, p.country].filter(Boolean).join(', ')
  return { name, detail, at: f.geometry.coordinates }
}
export async function searchPlaces(q: string, near: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lat=${near[1]}&lon=${near[0]}&lang=en`
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error('search_http_' + r.status)
  const d = (await r.json()) as { features?: PhotonFeature[] }
  return (d.features ?? []).map(placeOf)
}
export async function reversePlace(at: LngLat): Promise<Place | null> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lon=${at[0]}&lat=${at[1]}&lang=en`)
    const d = (await r.json()) as { features?: PhotonFeature[] }
    return d.features?.[0] ? placeOf(d.features[0]) : null
  } catch {
    return null
  }
}
export const kmh = (ms: number) => `${Math.round(ms * 3.6)} km/h`
/** Deep links to the phone's own maps app (escape hatch for long drives). */
export const mapLinks = (dest: LngLat, mode: NavMode) => ({
  google: `https://www.google.com/maps/dir/?api=1&destination=${dest[1]},${dest[0]}&travelmode=${mode === 'car' ? 'driving' : mode === 'bike' ? 'bicycling' : 'walking'}`,
  apple: `https://maps.apple.com/?daddr=${dest[1]},${dest[0]}&dirflg=${mode === 'car' ? 'd' : mode === 'bike' ? 'c' : 'w'}`,
})
