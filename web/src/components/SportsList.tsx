import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { toCell } from '../lib/h3'
import type { Game } from '../lib/types'
import { cityMajors, gameWhen, KIND_LABEL, kindOfId, majorRgb, SPORT_EMOJI, type Major } from '../lib/sports'

const EMPTY: Game[] = []

/** Fly to a game's stadium and open its hex (people can talk about the match right there). */
export function goToGame(g: Game) {
  const s = useStore.getState()
  s.selectGame(g.id)
  s.selectCell(toCell(g.lat, g.lng))
  s.selectPlace({ name: g.venue, kind: `${g.league} · ${g.home} v ${g.away}` })
  s.flyTo(g.lng, g.lat, 16.2)
}
export function goToVenue(m: Major) {
  const s = useStore.getState()
  s.selectGame(null)
  s.selectCell(toCell(m.p[1], m.p[0]))
  s.selectPlace({ name: m.n, kind: KIND_LABEL[kindOfId(m.k)] + (m.c ? ` · ${m.c.toLocaleString()} seats` : '') })
  s.flyTo(m.p[0], m.p[1], 16.2)
}

export function useCityGames() {
  const id = useStore((s) => s.city.id)
  return useStore((s) => s.games[id]) ?? EMPTY
}

function Logo({ src, name }: { src?: string; name: string }) {
  const [bad, setBad] = useState(false)
  if (!src || bad) return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[9px] font-bold text-white/70">{name.slice(0, 1)}</span>
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="h-5 w-5 shrink-0 object-contain" />
}

function GameCard({ g, compact }: { g: Game; compact?: boolean }) {
  const selected = useStore((s) => s.selectedGameId === g.id)
  const live = g.state === 'live'
  return (
    <button
      onClick={() => goToGame(g)}
      className={`rounded-xl p-2.5 text-left transition hover:bg-white/[.05] ${compact ? 'glass-strong w-[250px] shrink-0 snap-start rounded-2xl' : 'w-full'} ${selected ? 'bg-white/[.06] ring-1 ring-white/15' : ''}`}
    >
      <div className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.08em] uppercase">
        <span>{SPORT_EMOJI[g.sport]}</span>
        <span className="truncate text-fog">{g.league}</span>
        <span className={`ml-auto shrink-0 ${live ? 'flex items-center gap-1 text-[#ff3b30]' : g.state === 'post' ? 'text-white/40' : 'text-[#ffb020]'}`}>
          {live && <span className="live-dot" />}
          {gameWhen(g)}
        </span>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="mt-1 flex items-center gap-2">
          <Logo src={i ? g.awayLogo : g.homeLogo} name={i ? g.away : g.home} />
          <span className={`truncate text-[13px] ${i ? 'text-white/80' : 'font-medium text-white'}`}>{i ? g.away : g.home}</span>
          {g.score && <span className="num ml-auto text-[13px] font-semibold text-white">{g.score[i]}</span>}
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1 truncate text-[10.5px] text-white/45">
        🏟 {g.venue}
        {!compact && (
          <a
            href={g.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto shrink-0 rounded px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.1em] text-white/60 ring-1 ring-white/15 hover:text-white"
          >
            {g.source === 'espn' ? 'ESPN' : 'TSDB'} ↗
          </a>
        )}
      </div>
    </button>
  )
}

/** Desktop: fixtures + the city's big venues in the right rail when the home tab is SPORTS. */
export function SportsRail() {
  const games = useCityGames()
  const city = useStore((s) => s.city)
  const venues = useMemo(() => cityMajors(city.id).filter((m) => m.n && m.k <= 1).slice(0, 24), [city.id])
  return (
    <div className="glass scroll-thin flex-1 overflow-y-auto rounded-[20px] p-2">
      <div className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.14em] text-fog uppercase">Home games · next 14 days</div>
      {games.length ? (
        <ul className="space-y-1">
          {games.map((g) => (
            <li key={g.id}>
              <GameCard g={g} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 pb-2 text-[12px] text-white/50">No home games found in {city.name} for the next two weeks. Venues are on the map.</p>
      )}
      <div className="mt-2 border-t border-white/10 px-2 pt-2.5 pb-1.5 font-mono text-[10px] tracking-[0.14em] text-fog uppercase">Stadiums & arenas</div>
      <ul className="space-y-0.5">
        {venues.map((m) => {
          const [r, g, b] = majorRgb(m)
          return (
            <li key={m.n + m.p[0]}>
              <button onClick={() => goToVenue(m)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[.05]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgb(${r},${g},${b})`, boxShadow: `0 0 8px rgb(${r},${g},${b})` }} />
                <span className="truncate text-[12.5px] text-white/85">{m.n}</span>
                <span className="num ml-auto shrink-0 text-[10.5px] text-white/40">{m.c ? m.c.toLocaleString() : KIND_LABEL[kindOfId(m.k)]}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="px-2 pt-2 text-[9.5px] text-white/30">Venues © OpenStreetMap · fixtures ESPN / TheSportsDB</p>
    </div>
  )
}

/** Mobile: swipeable fixtures above the dock. */
export function SportsStrip() {
  const games = useCityGames()
  const city = useStore((s) => s.city)
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[calc(var(--dock-h)+12px)] z-20 lg:hidden">
      <div className="scroll-thin flex snap-x gap-2 overflow-x-auto px-3 pb-1">
        {games.length ? (
          games.map((g) => <GameCard key={g.id} g={g} compact />)
        ) : (
          <div className="glass-strong rounded-2xl px-3 py-2 text-[12px] text-white/60">No home games in {city.name} soon · stadiums & courts are on the map</div>
        )}
      </div>
    </div>
  )
}
