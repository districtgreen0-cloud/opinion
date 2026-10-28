import type { City, Comment, CrewMessage, Epoch, Friend, Listing, VEvent, Vibe } from '../lib/types'
import { toCell, disk, cellCenter, ringDistance } from '../lib/h3'

export const CITIES: City[] = [
  { id: 'ldn', name: 'London', center: [-0.1172, 51.5108], zoom: 16.2, bearing: -24, district: 'Strand · Olympia · Solana week' },
  { id: 'nyc', name: 'New York', center: [-73.9845, 40.7262], zoom: 15.6, bearing: -28, district: 'East Village' },
  { id: 'sf', name: 'San Francisco', center: [-122.4005, 37.7845], zoom: 15.7, bearing: 28, district: 'SoMa · Moscone · Union Square' },
  { id: 'bgd', name: 'Beograd', center: [20.4560, 44.8112], zoom: 15.6, bearing: -30, district: 'Savamala · Old Railway Station' },
  { id: 'ns', name: 'Novi Sad', center: [19.8452, 45.2551], zoom: 15.6, bearing: -12, district: 'Centar · Liman' },
  { id: 'rom', name: 'Roma', center: [12.4922, 41.8902], zoom: 15.9, bearing: -18, district: 'Colosseo · Monti · Fori Imperiali' },
]

/** Rome: the Colosseum hologram replaces this event's generic beacon (map/colosseumArt.ts). */
export const COLOSSEUM_EVENT = 'rom-colosseum'
export const COLOSSEUM_URL = 'https://www.colosseum.com/'

// deterministic RNG so the city looks the same on every load
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
const seedOf = (id: string) => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)

export const HANDLES = [
  '@nyx', '@solene', '@kairo', '@mira.wav', '@dex', '@lumen', '@ozzy', '@vela',
  '@juno', '@teo', '@sasha', '@rook', '@ines', '@bash', '@noor', '@kit',
]

/**
 * London · Solana week (real dates & venues; times in UK time).
 * Breakpoint 2026: solana.com/breakpoint · Demo Day + Hacker House: luma.com/sol-demo-day
 * The last three are sample side events for the demo.
 */
export const LANDMARK_EVENT: Record<string, 'olympia' | 'somerset'> = {
  'ldn-bp26': 'olympia',
  'ldn-hh': 'somerset',
  'ldn-demoday': 'somerset',
}
const LONDON_EVENTS = (): VEvent[] => {
  const d = (s: string) => Date.parse(s)
  const now = Date.now()
  const status = (a: number, b: number): VEvent['status'] => (now >= a && now <= b ? 'live' : 'upcoming')
  const mk = (e: Omit<VEvent, 'status'>): VEvent => ({ ...e, status: status(e.startsAt, e.endsAt) })
  return [
    mk({ id: 'ldn-bp26', title: 'Breakpoint 2026: The Token Supercycle', host: 'Solana Foundation', venue: 'Olympia London', lat: 51.4963, lng: -0.2096, startsAt: d('2026-11-15T09:00:00Z'), endsAt: d('2026-11-17T19:00:00Z'), cover: 'linear-gradient(135deg,#000 0%,#9945ff 55%,#14f195 100%)', lumaUrl: 'https://solana.com/breakpoint', attendees: 5000 }),
    mk({ id: 'ldn-hh', title: 'Solana Hacker House London', host: 'Solana Foundation × Superteam UK', venue: 'Somerset House', lat: 51.5109, lng: -0.1174, startsAt: d('2026-11-01T09:00:00Z'), endsAt: d('2026-11-12T22:00:00Z'), cover: 'linear-gradient(135deg,#1a0636 0%,#9945ff 60%,#19fb9b 100%)', lumaUrl: 'https://luma.com/sol-demo-day', attendees: 400 }),
    mk({ id: 'ldn-demoday', title: 'Solana Demo Day | London 2026', host: 'Solana Foundation × Superteam UK', venue: 'Somerset House', lat: 51.5112, lng: -0.1169, startsAt: d('2026-11-12T10:00:00Z'), endsAt: d('2026-11-12T18:30:00Z'), cover: 'linear-gradient(135deg,#001a0c 0%,#008953 50%,#9945ff 100%)', lumaUrl: 'https://luma.com/sol-demo-day', attendees: 600 }),
    mk({ id: 'ldn-s1', title: 'Validators After Dark', host: 'Sample side event', venue: 'Covent Garden', lat: 51.5118, lng: -0.1230, startsAt: d('2026-11-14T19:00:00Z'), endsAt: d('2026-11-15T01:00:00Z'), cover: 'linear-gradient(135deg,#050505,#9945ff)', lumaUrl: 'https://luma.com/discover', attendees: 220 }),
    mk({ id: 'ldn-s2', title: 'Builders Breakfast', host: 'Sample side event', venue: 'Kensington', lat: 51.4995, lng: -0.1985, startsAt: d('2026-11-16T07:30:00Z'), endsAt: d('2026-11-16T09:30:00Z'), cover: 'linear-gradient(135deg,#050505,#14f195)', lumaUrl: 'https://luma.com/discover', attendees: 90 }),
    mk({ id: 'ldn-s3', title: 'Thames Afterparty', host: 'Sample side event', venue: 'Victoria Embankment', lat: 51.5085, lng: -0.1205, startsAt: d('2026-11-17T21:00:00Z'), endsAt: d('2026-11-18T03:00:00Z'), cover: 'linear-gradient(135deg,#1a0636,#00c2ff)', lumaUrl: 'https://luma.com/discover', attendees: 350 }),
  ]
}

const EVENT_TEMPLATES = [
  { title: 'Basement Frequencies', host: 'LOWEND', venue: 'The Vault', cover: 'linear-gradient(135deg,#2b0b5e,#b26bff 60%,#ff5a1f)' },
  { title: 'Night Market: Neon Edition', host: 'Opinion Collective', venue: 'Rooftop 9', cover: 'linear-gradient(135deg,#0b2e2a,#3dffa8 70%,#e8fff5)' },
  { title: 'Solana Builders After Dark', host: 'Superteam', venue: 'Glasshouse', cover: 'linear-gradient(135deg,#140b2e,#7b3dff 55%,#3dffa8)' },
  { title: 'Ambient Rooftop Session', host: 'Drift Radio', venue: 'Skyline Terrace', cover: 'linear-gradient(135deg,#1a0f05,#ff5a1f 60%,#ffd23d)' },
  { title: 'Analog Film Club', host: 'Grain', venue: 'Cinema Noir', cover: 'linear-gradient(135deg,#050505,#3a3a44 50%,#e8e8ee)' },
  { title: 'Warehouse 03:00', host: 'NOCTURNE', venue: 'Pier Warehouse', cover: 'linear-gradient(135deg,#2e0b1f,#ff3d8b 60%,#b26bff)' },
]

const COMMENT_POOL = [
  'line is 20 min but moving fast',
  'bass in here is unreal rn',
  'who left a jacket on the stairs lol',
  'rooftop opening in 10',
  'free water at the bar, stay hydrated',
  'dj just dropped an unreleased one 🔥',
  'quiet tonight, good vibes though',
  'anyone selling 1 ticket for later?',
  'best pizza slice on this block, trust',
  'cops chilling by the corner, all good',
  'sunset from here is insane',
  'crew meeting at the fountain at 11',
  'they ran out of tote bags already',
  'this hex is the move tonight',
  'new mural just went up on the wall',
  'coat check is free before midnight',
  'set times got pushed 30 min',
  'the visuals on the back wall 😮',
  'met half my crew here lmao',
  'it is LOUD loud',
  'secret show in the back room, ask for nyx',
  'raining, everyone inside now',
  'line at the bodega > line at the club',
  'just claimed epoch 6 🫡',
]

const TOPICS = [
  { title: 'Best late-night food around here?', text: 'Kitchen closes at 2 everywhere. Where do you go after?', replies: ['bodega on the corner does hot sandwiches till 4', 'the ramen spot two blocks down, no question', 'pizza by the slice place never closes'] },
  { title: 'Noise from the rooftop parties', text: 'Neighbours are complaining again. Can we agree on a 1am cutoff?', replies: ['1am is fair on weeknights', 'weekends should be 2', 'just close the windows lol'] },
  { title: 'Lost: black film camera', text: 'Left a Contax T2 near the fountain around 11pm. Reward.', replies: ['saw someone hand one to the bar staff', 'checking the lost & found for you'] },
  { title: 'Who is going to the warehouse thing?', text: 'Trying to put a crew together, meeting at 1am.', replies: ['in', 'in, bringing 2', 'maybe, depends on the line'] },
  { title: 'Street fair this Sunday', text: 'Anyone know which blocks are closing?', replies: ['avenue A between 7th and 10th'] },
]

const JOBS = [
  { title: 'Help carry DJ gear up 4 floors', text: 'Two speakers + decks, 20 min job, tonight 9pm.', price: 40 },
  { title: 'Photographer for 2h event set', text: 'Need someone with their own camera, candid shots of the crowd.', price: 180 },
  { title: 'Walk my dog at 7am', text: 'Friendly lab, 30 minutes around the park.', price: 15 },
  { title: 'Fix a flickering neon sign', text: 'Small bar sign, probably a transformer. Tools on site.', price: 90 },
  { title: 'Hand out flyers on the block', text: '200 flyers, 1 hour, before the show starts.', price: 35 },
  { title: 'Translate a menu (EN → SR)', text: 'One page, 40 items. Can be done remotely but come taste after.', price: 60 },
  { title: 'Door person for a house show', text: 'Check the list, keep it chill. 10pm–1am.', price: 120 },
  { title: 'Wait in line for 2 tickets', text: 'Box office opens at noon. I pay the tickets separately.', price: 25 },
]

const CREW_POOL = [
  'who\'s pregaming?', 'landing in 15', 'grabbing the back left corner',
  'anyone got an extra wristband', 'the opener is SO good', 'meet at the bar',
  'sending location 📍', 'this is the one tonight', 'leaving soon, afters?',
  'hey 👋', 'just joined the crew!', 'bring a jacket it\'s cold on the roof',
]

export type CityData = {
  events: VEvent[]
  comments: Comment[]
  friends: Friend[]
  people: { lng: number; lat: number; c: number }[]
  hexActivity: Map<string, number>
  poiCells: Set<string>
  crews: CrewMessage[]
  listings: Listing[]
}

const cache = new Map<string, CityData>()

export function cityData(city: City): CityData {
  const hit = cache.get(city.id)
  if (hit) return hit
  const r = rng(seedOf(city.id))
  const [clng, clat] = city.center
  const jitter = (spread: number) => (r() - 0.5) * spread
  const now = Date.now()
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]

  const generated: VEvent[] = city.id === 'ldn' ? [] : EVENT_TEMPLATES.map((t, i) => {
    const live = i < 3
    const ang = (i / EVENT_TEMPLATES.length) * Math.PI * 2 + r()
    const rad = 0.0025 + r() * 0.004
    const start = live ? now - (30 + r() * 120) * 60000 : now + (2 + i * 9 + r() * 6) * 3600000
    return {
      id: `${city.id}-ev${i}`,
      ...t,
      lat: clat + Math.sin(ang) * rad * 0.75,
      lng: clng + Math.cos(ang) * rad,
      startsAt: start,
      endsAt: start + (4 + r() * 3) * 3600000,
      status: live ? 'live' : 'upcoming',
      lumaUrl: 'https://lu.ma/discover',
      attendees: Math.round(live ? 80 + r() * 420 : 30 + r() * 200),
    }
  })
  const events: VEvent[] =
    city.id === 'ldn'
      ? LONDON_EVENTS()
      : city.id === 'rom'
        ? [
            {
              id: COLOSSEUM_EVENT, title: 'Enter the Arena', host: 'Colosseum', venue: 'Colosseo', lat: 41.8902, lng: 12.4922,
              startsAt: now - 3600000, endsAt: now + 45 * 86400000, status: 'live', cover: 'linear-gradient(135deg,#000 0%,#2a2a33 45%,#c77dff 80%,#5de0c8 100%)',
              lumaUrl: COLOSSEUM_URL, attendees: 2600,
            },
            ...generated,
          ]
        : generated

  // hex activity: hot around live venues, warm scatter elsewhere
  const hexActivity = new Map<string, number>()
  const bump = (cell: string, v: number) => hexActivity.set(cell, Math.min(1, (hexActivity.get(cell) ?? 0) + v))
  for (const e of events) {
    const c = toCell(e.lat, e.lng)
    // glow fades with ring distance from the venue (radius in res-10 rings ≈ 120 m each)
    const radius = e.status === 'live' ? 5 : 3
    for (const h of disk(c, radius)) {
      const ring = ringDistance(c, h)
      bump(h, ((e.status === 'live' ? 0.8 : 0.4) * (1 - ring / (radius + 1))) * (0.75 + r() * 0.5))
    }
  }
  for (const h of disk(toCell(clat, clng), 18)) if (r() < 0.1) bump(h, 0.08 + r() * 0.35)

  const poiCells = new Set(events.map((e) => toCell(e.lat, e.lng)))

  // ~24 comments across ~15 hexes
  const activeCells = [...hexActivity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c]) => c)
  const comments: Comment[] = Array.from({ length: 26 }, (_, i) => {
    const cell = activeCells[i % activeCells.length]
    const av = Math.floor(r() * 8)
    return {
      id: `${city.id}-c${i}`,
      cell,
      text: COMMENT_POOL[(i + seedOf(city.id)) % COMMENT_POOL.length],
      handle: pick(HANDLES),
      avatar: `av:${av}`,
      createdAt: now - Math.round(r() * 180) * 60000 - 20000,
    }
  }).sort((a, b) => b.createdAt - a.createdAt)

  const vibes: Vibe[] = ['out', 'chill', 'looking']
  const friends: Friend[] = HANDLES.slice(0, 8).map((h, i) => {
    const going = i < 5 ? events[i % 3].id : undefined
    const base = going ? events.find((e) => e.id === going)! : { lat: clat + jitter(0.012), lng: clng + jitter(0.016) }
    return {
      id: `${city.id}-f${i}`,
      handle: h,
      avatar: `av:${i}`,
      lat: base.lat + jitter(0.0012),
      lng: base.lng + jitter(0.0016),
      vibe: going ? 'out' : pick(vibes),
      online: r() > 0.15,
      goingTo: going,
    }
  })

  // 2,000 ambient people — unclustered, proves 60fps
  const people = Array.from({ length: 2000 }, () => {
    const near = r() < 0.55 ? pick(events) : null
    const s = near ? 0.0025 : 0.02
    const b = near ?? { lat: clat, lng: clng }
    return { lng: b.lng + jitter(s * 1.3), lat: b.lat + jitter(s), c: near?.status === 'live' ? 1 : 0 }
  })

  const crews: CrewMessage[] = events.flatMap((e) =>
    Array.from({ length: 5 + Math.floor(r() * 7) }, (_, i) => ({
      id: `${e.id}-m${i}`,
      eventId: e.id,
      handle: pick(HANDLES),
      avatar: `av:${Math.floor(r() * 8)}`,
      text: pick(CREW_POOL),
      createdAt: now - (12 - i) * (3 + r() * 6) * 60000,
    })),
  )

  const listings: Listing[] = events.slice(0, 6).map((e, i) => ({
    id: `${e.id}-l`,
    eventId: e.id,
    seller: pick(HANDLES),
    avatar: `av:${(i + 3) % 8}`,
    priceUsdc: Math.round(18 + r() * 70),
    tier: pick(['GA', 'GA', 'Early', 'VIP']),
    status: 'open',
  }))

  // topics (with replies) and USDC job offers, seeded across the busiest hexes
  const posts: Comment[] = []
  TOPICS.forEach((t, i) => {
    const cell = activeCells[(i * 3 + 1) % activeCells.length]
    const id = `${city.id}-t${i}`
    const at = now - (40 + i * 55 + Math.round(r() * 30)) * 60000
    posts.push({ id, cell, kind: 'topic', title: t.title, text: t.text, handle: pick(HANDLES), avatar: `av:${Math.floor(r() * 8)}`, createdAt: at })
    t.replies.forEach((txt, k) =>
      posts.push({ id: `${id}-r${k}`, cell, kind: 'reply', parentId: id, text: txt, handle: pick(HANDLES), avatar: `av:${Math.floor(r() * 8)}`, createdAt: at + (k + 1) * (4 + r() * 12) * 60000 }),
    )
  })
  JOBS.forEach((j, i) => {
    const cell = activeCells[(i * 2 + 2) % activeCells.length]
    const status = (['open', 'open', 'funded', 'open', 'funded', 'taken', 'open', 'delivered'] as const)[i % 8]
    const taken = status === 'taken' || status === 'delivered'
    posts.push({
      id: `${city.id}-j${i}`,
      cell,
      kind: 'job',
      title: j.title,
      text: j.text,
      priceUsdc: j.price,
      jobStatus: status,
      handle: pick(HANDLES),
      avatar: `av:${Math.floor(r() * 8)}`,
      wallet: 'mock' + i,
      workerHandle: taken ? pick(HANDLES) : undefined,
      createdAt: now - (15 + i * 47 + Math.round(r() * 40)) * 60000,
    })
  })
  comments.push(...posts)
  comments.sort((a, b) => b.createdAt - a.createdAt)

  const data = { events, comments, friends, people, hexActivity, poiCells, crews, listings }
  cache.set(city.id, data)
  return data
}

export function randomComment(cell: string): Comment {
  const i = Math.floor(Math.random() * COMMENT_POOL.length)
  return {
    id: `rt-${Math.random().toString(36).slice(2, 9)}`,
    cell,
    text: COMMENT_POOL[i],
    handle: HANDLES[Math.floor(Math.random() * HANDLES.length)],
    avatar: `av:${Math.floor(Math.random() * 8)}`,
    createdAt: Date.now(),
  }
}

export function randomCrewMessage(eventId: string): CrewMessage {
  return {
    id: `rt-${Math.random().toString(36).slice(2, 9)}`,
    eventId,
    handle: HANDLES[Math.floor(Math.random() * HANDLES.length)],
    avatar: `av:${Math.floor(Math.random() * 8)}`,
    text: CREW_POOL[Math.floor(Math.random() * CREW_POOL.length)],
    createdAt: Date.now(),
  }
}

export function epochs(now = Date.now()): Epoch[] {
  const WEEK = 7 * 86400000
  // Epoch 7 is active; ends in ~1W 2D 12H 5M at first load, anchored to a stable boundary
  const end7 = now + WEEK + 2 * 86400000 + 12 * 3600000 + 5 * 60000
  return [7, 6, 5, 4].map((n) => ({
    n,
    endsAt: end7 - (7 - n) * WEEK,
    startsAt: end7 - (8 - n) * WEEK - 2 * WEEK,
    pool: 1_000_000,
    earned: n === 7 ? 0 : [0, 0, 0, 0, 1240.5, 862.25, 410][n],
    claimed: n === 4,
  }))
}

export { cellCenter }

/**
 * Merge live events (Luma iCal / Eventbrite) into a city. Replaces the cached CityData with a new object so
 * memoised consumers recompute once the store swaps in a fresh `city` reference. Returns how many were new.
 */
export function addExternalEvents(cityId: City['id'], incoming: VEvent[]): number {
  const city = CITIES.find((c) => c.id === cityId)
  if (!city) return 0
  const d = cityData(city)
  const known = new Set(d.events.map((e) => e.id))
  const fresh = incoming.filter((e) => !known.has(e.id))
  if (!fresh.length) return 0
  const hexActivity = new Map(d.hexActivity)
  for (const e of fresh) {
    const c = toCell(e.lat, e.lng)
    for (const h of disk(c, 2)) {
      const glow = (e.status === 'live' ? 0.6 : 0.3) * (1 - ringDistance(c, h) / 3)
      hexActivity.set(h, Math.min(1, (hexActivity.get(h) ?? 0) + glow))
    }
  }
  cache.set(cityId, { ...d, events: [...d.events, ...fresh], hexActivity })
  return fresh.length
}
