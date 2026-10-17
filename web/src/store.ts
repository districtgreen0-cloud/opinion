import { create } from 'zustand'
import type { City, Comment, CrewMessage, Game, Listing, Vibe } from './lib/types'
import { CITIES, cityData, epochs } from './data/mock'
import { toCell, isCurrentRes, H3_RES } from './lib/h3'
import { cellToCenterChild, getResolution, latLngToCell } from 'h3-js'
import { uid } from './lib/format'
import type { Footprint } from './lib/timeline'
import type { Account } from './lib/auth'
import type { Consent } from './lib/earn'
import type { LngLat, NavMode, Route } from './lib/route'
import type { SimSize } from './lib/sim'

export type HomeFilter = 'all' | 'event' | 'sport' | 'topic' | 'note' | 'job'
export type Tab = 'explore' | 'events' | 'crews' | 'market' | 'chat' | 'rewards' | 'account'
export type Lighting = 'midnight' | 'neon' | 'dusk'
export type ThemePref = 'dark' | 'light' | 'system'
export type Toast = { id: string; text: string; tone?: 'ember' | 'violet' | 'mint' }
export type FriendLink = { avatar: string; status: 'pending' | 'friends'; since: number }
export type ProfileRef = { handle: string; avatar: string; x?: number; y?: number }
export type Nav = { dest: LngLat; name: string; mode: NavMode; route: Route | null; status: 'routing' | 'active' | 'error'; follow: boolean; simulate: boolean; key: number }
export type Pos = { lat: number; lng: number; source: 'gps' | 'teleport' }

type State = {
  city: City
  tab: Tab
  lighting: Lighting
  /** appearance: user choice + what it resolves to right now */
  themePref: ThemePref
  ui: 'dark' | 'light'
  setThemePref: (t: ThemePref) => void
  setUi: (u: 'dark' | 'light') => void
  splashDone: boolean
  /** a city has been picked this session (otherwise the app opens on the world map) */
  entered: boolean
  pickerOpen: boolean
  mapReady: boolean
  /** user-load simulation on the map (visual only) */
  sim: SimSize | null
  setSim: (s: SimSize | null) => void
  /** live device location (continuous GPS while on) */
  tracking: boolean
  geoAcc: number | null
  geoError: string | null // why the last location attempt failed (human text)
  setGeoError: (m: string | null) => void
  geoSpeed: number | null // m/s from GPS while moving
  setGeoSpeed: (v: number | null) => void
  heading: number | null
  setHeading: (d: number | null) => void
  setTracking: (v: boolean) => void
  setGeoAcc: (m: number | null) => void
  /** last tapped map point (navigation destination) */
  pickPoint: LngLat | null
  setPickPoint: (p: LngLat | null) => void
  /** ask the hex sheet to open the camera right away */
  cameraRequest: number
  requestCamera: () => void
  nav: Nav | null
  /** destination search panel ("Where to?") */
  navSearch: boolean
  setNavSearch: (v: boolean) => void
  startNav: (dest: LngLat, name: string, mode?: NavMode) => void
  patchNav: (p: Partial<Nav>) => void
  endNav: () => void
  /** Earn mode: opt-in data contribution (consent per tier) */
  earnConsent: Consent | null
  earnPaused: boolean
  earnPoints: number
  earnOpen: boolean
  setEarnOpen: (v: boolean) => void
  setEarnConsent: (c: Consent | null) => void
  setEarnPaused: (v: boolean) => void
  addEarnPoints: (n: number, why?: string) => void
  profile: ProfileRef | null
  openProfile: (p: ProfileRef | null) => void
  friendLinks: Record<string, FriendLink>
  addFriend: (handle: string, avatar: string) => void
  removeFriend: (handle: string) => void
  /** World view: the map pans to this city (city strip) */
  peek: { center: [number, number]; key: number } | null
  peekCity: (center: [number, number]) => void
  setMapReady: () => void
  setPickerOpen: (v: boolean) => void
  enterCity: (id: City['id']) => void
  goWorld: () => void

  me: { handle: string; avatar: string; vibe: Vibe; ghost: boolean }
  wallet: { address: string; kind: 'solflare' | 'mock' } | null

  pos: Pos | null
  geoStatus: 'idle' | 'asking' | 'granted' | 'denied' | 'unavailable'
  teleportArmed: boolean

  selectedCell: string | null
  selectedPlace: { name: string; kind: string } | null
  selectedEventId: string | null
  crewEventId: string | null
  flyTarget: { lng: number; lat: number; zoom?: number; key: number } | null

  comments: Comment[]
  crews: CrewMessage[]
  listings: Listing[]
  plans: Record<string, 'going' | 'interested'>
  joinedCrews: string[]

  points: number
  visited: string[]
  claimed: number[]
  epochs: ReturnType<typeof epochs>
  toasts: Toast[]
  footprint: Footprint | null
  account: Account | null
  authOpen: boolean
  setAuthOpen: (v: boolean) => void
  setAccount: (a: Account | null) => void
  showFootprint: boolean

  setTab: (t: Tab) => void
  setCity: (id: City['id']) => void
  refreshCity: () => void
  feedInfo: Record<string, { count: number; sources: Record<string, number | string>; at: number }>
  games: Record<string, Game[]>
  setGames: (city: string, g: Game[]) => void
  selectedGameId: string | null
  selectGame: (id: string | null) => void
  setFeedInfo: (city: string, info: { count: number; sources: Record<string, number | string>; at: number }) => void
  setLighting: (l: Lighting) => void
  finishSplash: () => void
  setMe: (p: Partial<State['me']>) => void
  setWallet: (w: State['wallet']) => void
  setPos: (p: Pos | null) => void
  setGeoStatus: (s: State['geoStatus']) => void
  armTeleport: (on: boolean) => void
  selectCell: (c: string | null) => void
  selectPlace: (p: State['selectedPlace']) => void
  selectEvent: (id: string | null) => void
  openCrew: (id: string | null) => void
  flyTo: (lng: number, lat: number, zoom?: number) => void
  addComment: (c: Comment) => void
  upsertPost: (c: Comment) => void
  hexTab: 'topic' | 'note' | 'job' | 'memory'
  setHexTab: (t: 'topic' | 'note' | 'job' | 'memory') => void
  marketTab: 'jobs' | 'tickets' | 'cards'
  homeFilter: HomeFilter
  setHomeFilter: (f: HomeFilter) => void
  setMarketTab: (t: 'jobs' | 'tickets' | 'cards') => void
  addCrewMessage: (m: CrewMessage) => void
  setPlan: (eventId: string, p: 'going' | 'interested' | null) => void
  joinCrew: (eventId: string) => void
  updateListing: (id: string, status: Listing['status']) => void
  award: (pts: number, why?: string) => void
  visit: (cell: string) => void
  claim: (n: number) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
  setFootprint: (f: Footprint | null) => void
  toggleFootprint: (on: boolean) => void
}

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem('opinion:' + k)
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem('opinion:' + k, JSON.stringify(v))
  } catch {
    /* private mode */
  }
}

/** Footprints saved at an older hex size are re-mapped to the current one (cells → centre child, places → recomputed). */
function migrateFootprint(f: Footprint | null): Footprint | null {
  if (!f) return null
  const first = Object.keys(f.cells)[0]
  if (!first || (f.res ?? getResolution(first)) === H3_RES) return f
  const cells: Record<string, number> = {}
  for (const [c, n] of Object.entries(f.cells)) {
    const from = getResolution(c)
    const to = from < H3_RES ? cellToCenterChild(c, H3_RES) : c
    cells[to] = (cells[to] ?? 0) + n
  }
  return { ...f, res: H3_RES, cells, places: f.places.map((p) => ({ ...p, cell: latLngToCell(p.lat, p.lng, H3_RES) })) }
}

// 'city2' key: London becomes the default for everyone once (Solana week)
const initialCity = CITIES.find((c) => c.id === load('city2', 'ldn')) ?? CITIES[0]
const seeded = (city: City) => {
  const d = cityData(city)
  return { comments: d.comments, crews: d.crews, listings: d.listings }
}

export const useStore = create<State>((set, get) => ({
  city: initialCity,
  tab: 'explore',
  lighting: load('lighting', 'midnight'),
  themePref: load<ThemePref>('theme', 'dark'),
  ui: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  setThemePref: (themePref) => {
    save('theme', themePref)
    set({ themePref })
  },
  setUi: (ui) => set({ ui }),
  splashDone: false,
  entered: (() => {
    try {
      return localStorage.getItem('opinion:entered') === '1' || sessionStorage.getItem('opinion:entered') === '1'
    } catch {
      return false
    }
  })(),
  pickerOpen: false,
  mapReady: false,
  sim: null,
  setSim: (sim) => set({ sim }),
  tracking: load('tracking', false),
  geoAcc: null,
  geoError: null,
  setGeoError: (geoError) => set({ geoError }),
  geoSpeed: null,
  setGeoSpeed: (geoSpeed) => set({ geoSpeed }),
  heading: null,
  setHeading: (heading) => set({ heading }),
  setTracking: (tracking) => {
    save('tracking', tracking)
    set({ tracking })
  },
  setGeoAcc: (geoAcc) => set({ geoAcc }),
  pickPoint: null,
  setPickPoint: (pickPoint) => set({ pickPoint }),
  cameraRequest: 0,
  requestCamera: () => set({ cameraRequest: Date.now() }),
  nav: null,
  navSearch: false,
  setNavSearch: (navSearch) => set({ navSearch }),
  startNav: (dest, name, mode) =>
    set({ nav: { dest, name, mode: mode ?? load<NavMode>('navMode', 'foot'), route: null, status: 'routing', follow: true, simulate: false, key: Date.now() }, selectedCell: null, tab: 'explore', navSearch: false }),
  patchNav: (p) => {
    const nav = get().nav
    if (!nav) return
    if (p.mode) save('navMode', p.mode)
    set({ nav: { ...nav, ...p } })
  },
  endNav: () => set({ nav: null }),
  earnConsent: load<Consent | null>('earnConsent', null),
  earnPaused: load('earnPaused', false),
  earnPoints: load('earnPoints', 0),
  earnOpen: false,
  setEarnOpen: (earnOpen) => set({ earnOpen }),
  setEarnConsent: (earnConsent) => {
    save('earnConsent', earnConsent)
    set({ earnConsent, earnPaused: false })
    save('earnPaused', false)
  },
  setEarnPaused: (earnPaused) => {
    save('earnPaused', earnPaused)
    set({ earnPaused })
  },
  addEarnPoints: (n, why) => {
    const earnPoints = get().earnPoints + n
    save('earnPoints', earnPoints)
    set({ earnPoints })
    get().award(n, why)
  },
  profile: null,
  openProfile: (profile) => set({ profile }),
  friendLinks: load<Record<string, FriendLink>>('friends', {}),
  addFriend: (handle, avatar) => {
    if (handle === get().me.handle || get().friendLinks[handle]) return
    const put = (l: FriendLink) => {
      const friendLinks = { ...get().friendLinks, [handle]: l }
      save('friends', friendLinks)
      set({ friendLinks })
    }
    put({ avatar, status: 'pending', since: Date.now() })
    get().toast(`Friend request sent to ${handle}`, 'violet')
    // demo: people accept after a moment (live mode: the request waits in their inbox)
    setTimeout(() => {
      if (get().friendLinks[handle]?.status !== 'pending') return
      put({ avatar, status: 'friends', since: Date.now() })
      get().award(15, `${handle} accepted · new friend`)
    }, 1800 + Math.random() * 2200)
  },
  removeFriend: (handle) => {
    const friendLinks = { ...get().friendLinks }
    delete friendLinks[handle]
    save('friends', friendLinks)
    set({ friendLinks })
  },
  peek: null,
  peekCity: (center) => set({ peek: { center, key: Date.now() } }),
  setMapReady: () => set({ mapReady: true }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  enterCity: (id) => {
    try {
      sessionStorage.setItem('opinion:entered', '1')
      localStorage.setItem('opinion:entered', '1')
    } catch {
      /* storage blocked */
    }
    if (id !== get().city.id) get().setCity(id)
    set({ entered: true, pickerOpen: false })
  },
  goWorld: () => {
    try {
      sessionStorage.removeItem('opinion:entered')
      localStorage.removeItem('opinion:entered')
    } catch {
      /* storage blocked */
    }
    set({ entered: false, selectedCell: null, selectedEventId: null, tab: 'explore' })
    setTimeout(() => get().entered || set({ pickerOpen: true }), 4200)
  },

  me: load('me', { handle: '@you', avatar: 'av:0', vibe: 'out' as Vibe, ghost: false }),
  wallet: null,

  pos: null,
  geoStatus: 'idle',
  teleportArmed: false,

  selectedCell: null,
  selectedPlace: null,
  selectedEventId: null,
  crewEventId: null,
  flyTarget: null,

  ...seeded(initialCity),
  plans: load('plans', {}),
  joinedCrews: load('crews', []),

  points: load('points', 1820),
  visited: load<string[]>('visited', []).filter(isCurrentRes),
  claimed: load('claimed', [4]),
  epochs: epochs(),
  toasts: [],
  footprint: migrateFootprint(load<Footprint | null>('footprint', null)),
  showFootprint: load('showFootprint', true),
  account: load<Account | null>('account', null), // demo keeps it locally; live mode re-reads /api/auth/me
  authOpen: false,
  setAuthOpen: (authOpen) => set({ authOpen }),
  setAccount: (account) => {
    save('account', account)
    set({ account, authOpen: false })
    if (account) get().setMe({ handle: account.handle, avatar: account.avatar })
  },

  setTab: (tab) => set({ tab }),
  setCity: (id) => {
    const city = CITIES.find((c) => c.id === id)!
    save('city2', id)
    set({ city, ...seeded(city), selectedCell: null, selectedEventId: null, crewEventId: null, pos: get().pos?.source === 'gps' ? get().pos : null })
  },
  // new reference → every memo keyed on `city` recomputes with the freshly merged live events
  refreshCity: () => set({ city: { ...get().city } }),
  feedInfo: {},
  games: {},
  setGames: (city, g) => set({ games: { ...get().games, [city]: g } }),
  selectedGameId: null,
  selectGame: (selectedGameId) => set({ selectedGameId }),
  setFeedInfo: (city, info) => set({ feedInfo: { ...get().feedInfo, [city]: info } }),
  setLighting: (lighting) => {
    save('lighting', lighting)
    set({ lighting })
  },
  finishSplash: () => set({ splashDone: true }),
  setMe: (p) => {
    const me = { ...get().me, ...p }
    save('me', me)
    set({ me })
  },
  setWallet: (wallet) => set({ wallet }),
  setPos: (pos) => {
    set({ pos })
    if (pos) get().visit(toCell(pos.lat, pos.lng))
  },
  setGeoStatus: (geoStatus) => set({ geoStatus }),
  armTeleport: (teleportArmed) => set({ teleportArmed }),
  selectCell: (selectedCell) => set({ selectedCell, selectedPlace: null, selectedEventId: selectedCell ? get().selectedEventId : null }),
  selectPlace: (selectedPlace) => set({ selectedPlace }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  openCrew: (crewEventId) => set({ crewEventId, tab: crewEventId ? 'crews' : get().tab }),
  flyTo: (lng, lat, zoom) => set({ flyTarget: { lng, lat, zoom, key: Date.now() } }),
  addComment: (c) => {
    if (get().comments.some((x) => x.id === c.id)) return get().upsertPost(c)
    // notes roll off after 300; topics, replies and jobs are never evicted
    let notes = 0
    const comments = [c, ...get().comments].filter((x) => (x.kind ?? 'note') !== 'note' || ++notes <= 300)
    set({ comments })
  },
  upsertPost: (c) => {
    const list = get().comments
    set({ comments: list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...list] })
  },
  hexTab: 'note',
  setHexTab: (hexTab) => set({ hexTab }),
  marketTab: 'jobs',
  homeFilter: 'all',
  // choosing a kind on the home screen also decides which tab a tapped hex opens on
  setHomeFilter: (homeFilter) => set(homeFilter === 'all' || homeFilter === 'event' || homeFilter === 'sport' ? { homeFilter } : { homeFilter, hexTab: homeFilter }),
  setMarketTab: (marketTab) => set({ marketTab }),
  addCrewMessage: (m) => set({ crews: [...get().crews, m].slice(-600) }),
  setPlan: (eventId, p) => {
    const plans = { ...get().plans }
    if (p) plans[eventId] = p
    else delete plans[eventId]
    save('plans', plans)
    set({ plans })
  },
  joinCrew: (eventId) => {
    if (get().joinedCrews.includes(eventId)) return
    const joinedCrews = [...get().joinedCrews, eventId]
    save('crews', joinedCrews)
    set({ joinedCrews })
  },
  updateListing: (id, status) => set({ listings: get().listings.map((l) => (l.id === id ? { ...l, status } : l)) }),
  award: (pts, why) => {
    const points = get().points + pts
    save('points', points)
    set({ points })
    if (why) get().toast(`+${pts} · ${why}`, 'ember')
  },
  visit: (cell) => {
    if (get().visited.includes(cell)) return
    const visited = [...get().visited, cell]
    save('visited', visited)
    set({ visited })
    get().award(25, 'hex discovered')
  },
  claim: (n) => {
    const claimed = [...get().claimed, n]
    save('claimed', claimed)
    set({ claimed })
  },
  toast: (text, tone) => {
    const id = uid()
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) })
    setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setFootprint: (footprint) => {
    // stays in this browser only — never sent to the server
    if (footprint) save('footprint', footprint)
    else
      try {
        localStorage.removeItem('opinion:footprint')
      } catch {
        /* ignore */
      }
    set({ footprint, showFootprint: true })
  },
  toggleFootprint: (showFootprint) => {
    save('showFootprint', showFootprint)
    set({ showFootprint })
  },
}))
