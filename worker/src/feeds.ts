/**
 * External event feeds → OPINION events.
 *
 *  Luma        official public iCal feeds (free, no key): a city's Discover page + any public calendar.
 *              Every VEVENT carries GEO, so events land on the 3D map. We always link back to the Luma page.
 *  Eventbrite  official API (free private token). Eventbrite removed public search in 2020, so we can
 *              only list events of organizations you name (EVENTBRITE_ORGS). Skipped when no token is set.
 *
 * Used by the full backend (src/index.ts) and by the static share preview (web/share-worker.ts).
 */

export type FeedEvent = {
  id: string
  title: string
  host: string
  venue: string
  lat: number
  lng: number
  startsAt: number
  endsAt: number
  status: 'live' | 'upcoming'
  cover: string
  lumaUrl: string // link to the source event page (Luma or Eventbrite)
  attendees: number
  source: 'luma' | 'eventbrite'
}

export type FeedEnv = { EVENTBRITE_TOKEN?: string; EVENTBRITE_ORGS?: string }

declare global {
  interface Env {
    EVENTBRITE_TOKEN?: string // `wrangler secret put EVENTBRITE_TOKEN` (free private token from eventbrite.com/platform)
    EVENTBRITE_ORGS?: string // comma-separated Eventbrite organization ids to follow
  }
}

type CityFeeds = { center: [number, number]; radiusKm: number; luma: string[] }

// Luma iCal entities. discplace = a city's Discover page; cal = a public calendar (filtered to the radius).
const CITY_FEEDS: Record<string, CityFeeds> = {
  ldn: { center: [-0.1276, 51.5072], radiusKm: 40, luma: ['discover&id=discplace-QCcNk3HXowOR97j', 'calendar&id=cal-GNxoseumqYXHPf1'] },
  nyc: { center: [-73.9857, 40.7484], radiusKm: 40, luma: ['discover&id=discplace-Izx1rQVSh8njYpP', 'calendar&id=cal-GNxoseumqYXHPf1'] },
  sf: { center: [-122.4194, 37.7749], radiusKm: 40, luma: ['discover&id=discplace-BDj7GNbGlsF7Cka', 'calendar&id=cal-GNxoseumqYXHPf1'] },
  bgd: { center: [20.4573, 44.8125], radiusKm: 40, luma: ['calendar&id=cal-GNxoseumqYXHPf1'] },
  ns: { center: [19.8335, 45.2671], radiusKm: 40, luma: ['calendar&id=cal-GNxoseumqYXHPf1'] },
}

const HORIZON_DAYS = 21 // only events starting in the next 3 weeks (or live now)
const MAX_EVENTS = 40 // keep the 3D scene light on phones

// ── tiny RFC 5545 reader (enough for Luma's feeds: unfolding, TEXT unescaping, UTC dates, GEO)
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}
function unescapeText(v: string) {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}
function parseDate(v: string): number {
  // 20261007T163000Z | 20261007T163000 | 20261007
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim())
  if (!m) return NaN
  const [, y = '', mo = '', d = '', h = '0', mi = '0', s = '0'] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
}

export function parseIcs(ics: string): Record<string, string>[] {
  const out: Record<string, string>[] = []
  let cur: Record<string, string> | null = null
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur) out.push(cur)
      cur = null
    } else if (cur) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = (line.slice(0, i).split(';')[0] ?? '').toUpperCase()
      const params = line.slice(0, i)
      cur[key] = line.slice(i + 1)
      if (key === 'ORGANIZER') cur['ORGANIZER_PARAMS'] = params
    }
  }
  return out
}

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

// deterministic cover gradient per event so the same event always looks the same
const COVERS = [
  'linear-gradient(135deg,#000 0%,#9945ff 60%,#14f195 100%)',
  'linear-gradient(135deg,#0b0b1a,#00c2ff 60%,#9945ff)',
  'linear-gradient(135deg,#120018,#dc1fff 55%,#14f195)',
  'linear-gradient(135deg,#001a12,#14f195 60%,#00c2ff)',
  'linear-gradient(135deg,#140b2e,#7b3dff 55%,#ff5a1f)',
]
const coverFor = (id: string): string => COVERS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COVERS.length] ?? COVERS[0]!

function lumaToEvent(v: Record<string, string>, now: number): FeedEvent | null {
  const [lat, lng] = (v.GEO ?? '').split(';').map(Number)
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const startsAt = parseDate(v.DTSTART ?? '')
  const endsAt = parseDate(v.DTEND ?? '') || startsAt + 2 * 3600000
  if (!Number.isFinite(startsAt)) return null
  const desc = unescapeText(v.DESCRIPTION ?? '')
  const url = /https:\/\/(?:luma\.com|lu\.ma)\/[^\s)]+/.exec(desc)?.[0] ?? (v.LOCATION?.startsWith('http') ? v.LOCATION : 'https://luma.com/discover')
  // "Address:\n<line>" (Luma puts the venue there when it's public)
  const addr = /Address:\n([^\n]+)/.exec(desc)?.[1]?.trim()
  const venue = addr && !/check event page/i.test(addr) ? (addr.split(',')[0] ?? addr).slice(0, 60) : 'See event page'
  const hostParam = /CN="?([^";:]+)"?/.exec(v.ORGANIZER_PARAMS ?? '')?.[1]
  const hostLine = /Hosted by ([^\n]+)/.exec(desc)?.[1]
  return {
    id: 'luma-' + (v.UID ?? '').replace(/@.*$/, '').slice(0, 40),
    title: unescapeText(v.SUMMARY ?? 'Untitled').slice(0, 120),
    host: (hostLine ?? hostParam ?? 'Luma').slice(0, 80),
    venue,
    lat,
    lng,
    startsAt,
    endsAt,
    status: now >= startsAt && now <= endsAt ? 'live' : 'upcoming',
    cover: coverFor(v.UID ?? url),
    lumaUrl: url,
    attendees: 0,
    source: 'luma',
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const r = await fetch(url, { ...init, headers: { 'user-agent': 'OPINION/1.0 (+events map)', ...(init?.headers ?? {}) }, cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit)
    return r.ok ? await r.text() : null
  } catch {
    return null
  }
}

async function luma(city: CityFeeds, now: number): Promise<FeedEvent[]> {
  const feeds = await Promise.all(city.luma.map((e) => fetchText(`https://api.lu.ma/ics/get?entity=${e}`)))
  return feeds.flatMap((ics) => (ics ? parseIcs(ics) : [])).map((v) => lumaToEvent(v, now)).filter((e): e is FeedEvent => !!e)
}

type EbEvent = { id: string; name?: { text?: string }; url?: string; start?: { utc?: string }; end?: { utc?: string }; venue?: { name?: string; latitude?: string; longitude?: string }; organizer?: { name?: string } }

async function eventbrite(env: FeedEnv, now: number): Promise<{ events: FeedEvent[]; status: string }> {
  if (!env.EVENTBRITE_TOKEN) return { events: [], status: 'not_configured' }
  const orgs = (env.EVENTBRITE_ORGS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!orgs.length) return { events: [], status: 'no_orgs' }
  const out: FeedEvent[] = []
  for (const org of orgs.slice(0, 10)) {
    const txt = await fetchText(`https://www.eventbriteapi.com/v3/organizations/${encodeURIComponent(org)}/events/?status=live&expand=venue,organizer&page_size=50`, {
      headers: { authorization: `Bearer ${env.EVENTBRITE_TOKEN}` },
    })
    if (!txt) continue
    let data: { events?: EbEvent[] }
    try {
      data = JSON.parse(txt)
    } catch {
      continue
    }
    for (const e of data.events ?? []) {
      const lat = Number(e.venue?.latitude)
      const lng = Number(e.venue?.longitude)
      const startsAt = Date.parse(e.start?.utc ?? '')
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(startsAt)) continue // online events have no venue
      const endsAt = Date.parse(e.end?.utc ?? '') || startsAt + 2 * 3600000
      out.push({
        id: 'eb-' + e.id,
        title: (e.name?.text ?? 'Untitled').slice(0, 120),
        host: (e.organizer?.name ?? 'Eventbrite').slice(0, 80),
        venue: (e.venue?.name ?? 'See event page').slice(0, 60),
        lat,
        lng,
        startsAt,
        endsAt,
        status: now >= startsAt && now <= endsAt ? 'live' : 'upcoming',
        cover: coverFor(e.id),
        lumaUrl: e.url ?? 'https://www.eventbrite.com',
        attendees: 0,
        source: 'eventbrite',
      })
    }
  }
  return { events: out, status: 'ok' }
}

/** GET /api/feeds/events?city=ldn → { events, sources } (cached 30 min at the edge). */
export async function handleFeeds(req: Request, env: FeedEnv, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const url = new URL(req.url)
  const cityId = url.searchParams.get('city') ?? 'ldn'
  const city = CITY_FEEDS[cityId]
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900', 'access-control-allow-origin': '*' }
  if (!city) return new Response(JSON.stringify({ error: 'unknown_city' }), { status: 404, headers })

  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(`https://feeds.opinion.internal/v1/${cityId}`)
  const hit = await cache.match(key)
  if (hit) return new Response(hit.body, { headers: { ...headers, 'x-feed-cache': 'hit' } })

  const now = Date.now()
  const [lumaEvents, eb] = await Promise.all([luma(city, now), eventbrite(env, now)])
  const seen = new Set<string>()
  const events = [...lumaEvents, ...eb.events]
    .filter((e) => km(city.center, [e.lng, e.lat]) <= city.radiusKm) // global calendars → only this city
    .filter((e) => e.endsAt >= now && e.startsAt <= now + HORIZON_DAYS * 86400000)
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, MAX_EVENTS)

  const body = JSON.stringify({ city: cityId, events, sources: { luma: lumaEvents.length, eventbrite: eb.status === 'ok' ? eb.events.length : eb.status }, fetchedAt: now })
  ctx.waitUntil(cache.put(key, new Response(body, { headers: { ...headers, 'cache-control': 'public, max-age=1800' } })))
  return new Response(body, { headers: { ...headers, 'x-feed-cache': 'miss' } })
}
