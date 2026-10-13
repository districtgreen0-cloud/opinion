/**
 * Sports fixtures → OPINION games, pinned on real stadiums.
 *
 *  ESPN        public scoreboard JSON (no key, unofficial): football/soccer, NFL, NBA, WNBA, MLB, NHL, MLS, rugby,
 *              with venue name + live score. One request per league per month.
 *  TheSportsDB free public API (test key "123"): Serbian SuperLiga, ABA League, EuroLeague, KLS — per day.
 *              Production: use a paid key (THESPORTSDB_KEY), the free key is for testing.
 *
 * Neither source gives coordinates, so every game is matched to a named OpenStreetMap venue of the city
 * (web/src/data/sport-majors.json). Only games we can pin inside the city are returned (= local home games).
 * Used by the full backend (src/index.ts) and the static share preview (web/share-worker.ts).
 */
import majorsData from '../../web/src/data/sport-majors.json'

export type GameSport = 'soccer' | 'basketball' | 'football' | 'baseball' | 'hockey' | 'rugby' | 'tennis' | 'other'
export type Game = {
  id: string
  sport: GameSport
  league: string
  home: string
  away: string
  homeLogo?: string
  awayLogo?: string
  venue: string // OSM venue name (where the pin is)
  lat: number
  lng: number
  startsAt: number
  state: 'pre' | 'live' | 'post'
  detail: string // "67'", "FT", "Q3 4:12"…
  score?: [string, string] // home, away
  url: string
  source: 'espn' | 'thesportsdb'
}

export type SportsEnv = { THESPORTSDB_KEY?: string }

declare global {
  interface Env {
    THESPORTSDB_KEY?: string // `wrangler secret put THESPORTSDB_KEY` (paid key for production; the free test key is used otherwise)
  }
}

type Major = { n: string; a?: string[]; k: number; p: [number, number] }
const MAJORS = (majorsData as unknown as { cities: Record<string, Major[]> }).cities

type CitySports = {
  espn: string[] // sport/league paths
  sportsdb?: number[] // league ids, fetched per day
  where: RegExp // ESPN venue address must mention this (guards against same-named venues elsewhere)
  teamVenue?: Record<string, string> // home team → venue name, when the source has no venue
}

const LONDON = /\b(london|wembley|twickenham|brentford|stratford|tottenham|kingston|bromley|croydon|wimbledon|sutton(?! coldfield)|barnet|harrow|ealing|dagenham|greenwich|richmond|isleworth|ilford|romford|uxbridge|watford|hayes|dartford)\b/i
const SERBIA_TEAMS: Record<string, string> = {
  'crvena zvezda': 'Stadion Rajko Mitić',
  'red star belgrade': 'Stadion Rajko Mitić',
  'partizan belgrade': 'Stadion Partizana',
  'fk partizan': 'Stadion Partizana',
  'kk partizan': 'Beogradska arena',
  'kk crvena zvezda': 'Beogradska arena',
  'ofk beograd': 'Omladinski stadion',
  'cukaricki': 'Stadion Čukarički',
  'vojvodina': 'Stadion Karađorđe',
  'kk vojvodina': 'SPENS',
  'imt novi beograd': 'Stadion IMT',
  'rad': 'Stadion Kralj Petar Prvi',
  'zemun': 'Stadion Zemun',
  'kk mega': 'Hala Sportova Ranko Žeravica',
  'kk fmp': 'Hala sportova Železnik',
}

const CITY_SPORTS: Record<string, CitySports> = {
  ldn: {
    espn: ['soccer/eng.1', 'soccer/eng.2', 'soccer/eng.3', 'soccer/eng.4', 'soccer/eng.fa', 'soccer/eng.league_cup', 'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europa.conf', 'soccer/eng.w.1', 'football/nfl', 'rugby/267979', 'basketball/nba'],
    where: LONDON,
  },
  nyc: {
    espn: ['basketball/nba', 'basketball/wnba', 'football/nfl', 'baseball/mlb', 'hockey/nhl', 'soccer/usa.1', 'soccer/usa.nwsl', 'football/college-football'],
    where: /\b(NY|New York|NJ|New Jersey)\b/,
  },
  sf: {
    espn: ['basketball/nba', 'basketball/wnba', 'football/nfl', 'baseball/mlb', 'hockey/nhl', 'soccer/usa.1', 'soccer/usa.nwsl', 'football/college-football'],
    where: /\b(CA|California)\b/,
  },
  bgd: { espn: ['soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europa.conf'], sportsdb: [4671, 4477, 4546, 5121], where: /\b(Belgrade|Beograd|Serbia)\b/i, teamVenue: SERBIA_TEAMS },
  ns: { espn: ['soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europa.conf'], sportsdb: [4671, 4477, 5121], where: /\b(Novi Sad|Serbia)\b/i, teamVenue: SERBIA_TEAMS },
}

const HORIZON_DAYS = 14
const SPORTSDB_DAYS = 8 // per-day calls: keep the subrequest count well under the Workers limit
const MAX_GAMES = 60

// ── venue matching
const STOP = new Set(['the', 'stadium', 'stadion', 'stadio', 'arena', 'field', 'park', 'ground', 'grounds', 'centre', 'center', 'fc', 'fk', 'kk', 'sc', 'src', 'at', 'of', 'de', 'and', 'gradski', 'sportski', 'hala', 'sportova', 'sports', 'community'])
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'dj')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
    .trim()
const tokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)))

// sponsor names OSM doesn't carry yet → the OSM name
const ALIASES: Record<string, string> = {
  'reloc8 em community stadium': 'Bromley Football Club',
}

export function matchVenue(cityId: string, name: string): Major | null {
  const list = MAJORS[cityId] ?? []
  const n = norm(ALIASES[norm(name)] ?? name)
  if (!n) return null
  // current names beat old/alt names (a club's previous ground can carry its old sponsor name)
  for (const m of list) if (m.n && norm(m.n) === n) return m
  let best: Major | null = null
  let bestScore = 0
  const want = tokens(name)
  for (const m of list) {
    for (const cand of [m.n, ...(m.a ?? [])]) {
      if (!cand) continue
      if (norm(cand) === n) return m
      const have = tokens(cand)
      if (!want.size || !have.size) continue
      let inter = 0
      for (const t of want) if (have.has(t)) inter++
      const score = inter / (want.size + have.size - inter) + (m.k <= 1 ? 0.05 : 0) // prefer stadiums/arenas on ties
      if (inter && [...want].some((t) => t.length >= 4 && have.has(t)) && score > bestScore) {
        best = m
        bestScore = score
      }
    }
  }
  return bestScore >= 0.6 ? best : null
}

async function getJson<T>(url: string, ttl: number): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'OPINION/1.0 (+sports map)', accept: 'application/json' }, cf: { cacheTtl: ttl, cacheEverything: true } } as RequestInit)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

const SPORT_OF: Record<string, GameSport> = { soccer: 'soccer', basketball: 'basketball', football: 'football', baseball: 'baseball', hockey: 'hockey', rugby: 'rugby', tennis: 'tennis' }

type EspnCompetitor = { homeAway?: string; score?: string; team?: { displayName?: string; shortDisplayName?: string; logo?: string } }
type EspnEvent = {
  id: string
  date: string
  name?: string
  links?: { href?: string }[]
  status?: { type?: { state?: string; shortDetail?: string; detail?: string } }
  competitions?: { venue?: { fullName?: string; address?: { city?: string; state?: string; country?: string } }; competitors?: EspnCompetitor[] }[]
}
type EspnBoard = { leagues?: { name?: string; abbreviation?: string }[]; events?: EspnEvent[] }

const months = (now: number) => {
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 7).replace('-', '')
  return [...new Set([fmt(now - 6 * 3600000), fmt(now + HORIZON_DAYS * 86400000)])]
}

async function espn(cityId: string, cfg: CitySports, now: number, unmatched: Set<string>): Promise<Game[]> {
  const jobs = cfg.espn.flatMap((path) => months(now).map((m) => ({ path, m })))
  const boards = await Promise.all(jobs.map((j) => getJson<EspnBoard>(`https://site.api.espn.com/apis/site/v2/sports/${j.path}/scoreboard?dates=${j.m}&limit=400`, 600).then((b) => ({ ...j, b }))))
  const out: Game[] = []
  for (const { path, b } of boards) {
    if (!b) continue
    const league = b.leagues?.[0]?.abbreviation ?? b.leagues?.[0]?.name ?? path
    for (const e of b.events ?? []) {
      const c = e.competitions?.[0]
      const v = c?.venue
      if (!v?.fullName) continue
      const addr = [v.address?.city, v.address?.state, v.address?.country].filter(Boolean).join(', ')
      if (addr && !cfg.where.test(addr)) continue
      const m = matchVenue(cityId, v.fullName)
      if (!m) {
        if (addr) unmatched.add(`${v.fullName} (${addr})`)
        continue
      }
      const home = c?.competitors?.find((x) => x.homeAway === 'home') ?? c?.competitors?.[0]
      const away = c?.competitors?.find((x) => x.homeAway === 'away') ?? c?.competitors?.[1]
      const st = e.status?.type?.state
      const state = st === 'in' ? 'live' : st === 'post' ? 'post' : 'pre'
      out.push({
        id: `espn-${e.id}`,
        sport: SPORT_OF[path.split('/')[0] ?? ''] ?? 'other',
        league,
        home: home?.team?.shortDisplayName ?? home?.team?.displayName ?? '?',
        away: away?.team?.shortDisplayName ?? away?.team?.displayName ?? '?',
        homeLogo: home?.team?.logo,
        awayLogo: away?.team?.logo,
        venue: m.n || v.fullName,
        lng: m.p[0],
        lat: m.p[1],
        startsAt: Date.parse(e.date),
        state,
        detail: (e.status?.type?.shortDetail ?? '').slice(0, 40),
        score: state !== 'pre' && home?.score != null && away?.score != null ? [home.score, away.score] : undefined,
        url: e.links?.[0]?.href ?? 'https://www.espn.com',
        source: 'espn',
      })
    }
  }
  return out
}

type DbEvent = {
  idEvent: string
  strHomeTeam?: string
  strAwayTeam?: string
  strLeague?: string
  strSport?: string
  strVenue?: string
  strTimestamp?: string
  dateEvent?: string
  strTime?: string
  strStatus?: string
  intHomeScore?: string | null
  intAwayScore?: string | null
  strHomeTeamBadge?: string
  strAwayTeamBadge?: string
}

async function sportsdb(cityId: string, cfg: CitySports, env: SportsEnv, now: number, unmatched: Set<string>): Promise<Game[]> {
  if (!cfg.sportsdb?.length) return []
  const key = env.THESPORTSDB_KEY || '123'
  const days = Array.from({ length: SPORTSDB_DAYS }, (_, i) => new Date(now + i * 86400000).toISOString().slice(0, 10))
  const jobs = cfg.sportsdb.flatMap((l) => days.map((d) => `https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${d}&l=${l}`))
  const res = await Promise.all(jobs.map((u) => getJson<{ events?: DbEvent[] | null }>(u, 900)))
  const out: Game[] = []
  const seen = new Set<string>()
  for (const r of res) {
    for (const e of r?.events ?? []) {
      if (seen.has(e.idEvent)) continue
      seen.add(e.idEvent)
      const homeName = e.strHomeTeam ?? ''
      const tk = norm(homeName)
      const viaTeam = cfg.teamVenue?.[tk] ?? cfg.teamVenue?.[tk.replace(/^(fk|ofk) /, '')]
      const m = (e.strVenue && matchVenue(cityId, e.strVenue)) || (viaTeam && matchVenue(cityId, viaTeam)) || null
      if (!m) {
        if (e.strVenue && cityId === 'bgd') unmatched.add(`${e.strVenue} (${homeName})`)
        continue
      }
      const startsAt = Date.parse(e.strTimestamp ? e.strTimestamp.replace(/(\+00:00)?$/, 'Z') : `${e.dateEvent}T${e.strTime ?? '00:00:00'}Z`)
      if (!Number.isFinite(startsAt)) continue
      const status = (e.strStatus ?? '').toUpperCase()
      const finished = /^(FT|AET|PEN|AOT|MATCH FINISHED|FINISHED)$/.test(status)
      const live = !finished && !/^(NS|NOT STARTED|TBD|POSTPONED|CANCELLED|)$/.test(status)
      const state = finished ? 'post' : live ? 'live' : 'pre'
      out.push({
        id: `tsdb-${e.idEvent}`,
        sport: /basket/i.test(e.strSport ?? '') ? 'basketball' : /soccer/i.test(e.strSport ?? '') ? 'soccer' : 'other',
        league: (e.strLeague ?? '').replace('Basketball League of Serbia', 'KLS').replace('Adriatic ABA League', 'ABA League').replace('EuroLeague Basketball', 'EuroLeague'),
        home: homeName,
        away: e.strAwayTeam ?? '?',
        homeLogo: e.strHomeTeamBadge ? `${e.strHomeTeamBadge}/tiny` : undefined,
        awayLogo: e.strAwayTeamBadge ? `${e.strAwayTeamBadge}/tiny` : undefined,
        venue: m.n,
        lng: m.p[0],
        lat: m.p[1],
        startsAt,
        state,
        detail: state === 'pre' ? '' : status,
        score: state !== 'pre' && e.intHomeScore != null && e.intAwayScore != null ? [String(e.intHomeScore), String(e.intAwayScore)] : undefined,
        url: `https://www.thesportsdb.com/event/${e.idEvent}`,
        source: 'thesportsdb',
      })
    }
  }
  return out
}

/** GET /api/feeds/sports?city=ldn → { games, sources } (cached 10 min at the edge — scores move). */
export async function handleSports(req: Request, env: SportsEnv, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const url = new URL(req.url)
  const cityId = url.searchParams.get('city') ?? 'ldn'
  const cfg = CITY_SPORTS[cityId]
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' }
  if (!cfg) return new Response(JSON.stringify({ error: 'unknown_city' }), { status: 404, headers })

  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(`https://feeds.opinion.internal/sports/v1/${cityId}`)
  const hit = url.searchParams.has('nocache') ? undefined : await cache.match(key)
  if (hit) return new Response(hit.body, { headers: { ...headers, 'x-feed-cache': 'hit' } })

  const now = Date.now()
  const unmatched = new Set<string>()
  const [a, b] = await Promise.all([espn(cityId, cfg, now, unmatched), sportsdb(cityId, cfg, env, now, unmatched)])
  const seen = new Set<string>()
  const games = [...a, ...b]
    .filter((g) => g.startsAt >= now - 4 * 3600000 && g.startsAt <= now + HORIZON_DAYS * 86400000)
    .filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)))
    .sort((x, y) => (x.state === 'live' ? -1 : 0) - (y.state === 'live' ? -1 : 0) || x.startsAt - y.startsAt)
    .slice(0, MAX_GAMES)

  const body = JSON.stringify({ city: cityId, games, sources: { espn: a.length, thesportsdb: b.length }, unmatched: [...unmatched].slice(0, 30), fetchedAt: now })
  ctx.waitUntil(cache.put(key, new Response(body, { headers: { ...headers, 'cache-control': 'public, max-age=600' } })))
  return new Response(body, { headers: { ...headers, 'x-feed-cache': 'miss' } })
}
