export type PostKind = 'note' | 'topic' | 'reply' | 'job'
export type JobStatus = 'open' | 'funded' | 'taken' | 'delivered' | 'paid' | 'cancelled'

/** Anything posted inside a hex. Shared with the worker: keep in sync with worker/src/types.ts. */
export type Comment = {
  id: string
  cell: string
  text: string
  handle: string
  avatar: string
  wallet?: string
  createdAt: number
  kind?: PostKind // default 'note'
  title?: string // topic + job
  parentId?: string // reply → topic id
  priceUsdc?: number // job
  jobStatus?: JobStatus
  workerHandle?: string
  workerWallet?: string
}

export const kindOf = (c: Comment): PostKind => c.kind ?? 'note'

export type VEvent = {
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
  lumaUrl: string
  attendees: number
  source?: 'opinion' | 'luma' | 'eventbrite' // where the event came from (live feeds link back)
}

/** A fixture pinned on a real venue. Shared with the worker: keep in sync with worker/src/sports.ts. */
export type Game = {
  id: string
  sport: 'soccer' | 'basketball' | 'football' | 'baseball' | 'hockey' | 'rugby' | 'tennis' | 'other'
  league: string
  home: string
  away: string
  homeLogo?: string
  awayLogo?: string
  venue: string
  lat: number
  lng: number
  startsAt: number
  state: 'pre' | 'live' | 'post'
  detail: string
  score?: [string, string]
  url: string
  source: 'espn' | 'thesportsdb'
}

export type Friend = {
  id: string
  handle: string
  avatar: string
  lat: number
  lng: number
  vibe: Vibe
  online: boolean
  goingTo?: string
}

export type Vibe = 'out' | 'chill' | 'looking'

export type CrewMessage = {
  id: string
  eventId: string
  handle: string
  avatar: string
  text: string
  createdAt: number
  wave?: boolean
}

export type Listing = {
  id: string
  eventId: string
  seller: string
  avatar: string
  priceUsdc: number
  tier: string
  status: 'open' | 'escrow' | 'sold'
}

export type Epoch = {
  n: number
  startsAt: number
  endsAt: number
  pool: number
  earned: number
  claimed: boolean
}

export type City = {
  id: 'ldn' | 'nyc' | 'sf' | 'bgd' | 'ns'
  name: string
  center: [number, number] // lng, lat
  zoom: number
  bearing: number
  district: string
}
