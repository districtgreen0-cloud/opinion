import { useMemo } from 'react'
import { useStore } from '../store'
import { cityData } from '../data/mock'
import { toCell } from '../lib/h3'
import { dayRange } from '../lib/format'
import type { VEvent } from '../lib/types'
import { SourceBadge } from './bits'

/** Fly to an event's venue, light its beacon/landmark and open its hex. */
export function goToEvent(e: VEvent) {
  const s = useStore.getState()
  s.selectCell(toCell(e.lat, e.lng))
  s.selectEvent(e.id)
  s.flyTo(e.lng, e.lat, 16.4)
}

export function useCityEvents() {
  const city = useStore((s) => s.city)
  return useMemo(() => [...cityData(city).events].sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || a.startsAt - b.startsAt), [city])
}

/** Desktop: events in the right rail when the home tab is EVENTS. */
export function EventRail() {
  const events = useCityEvents()
  const selected = useStore((s) => s.selectedEventId)
  return (
    <ul className="glass scroll-thin flex-1 space-y-1.5 overflow-y-auto rounded-[20px] p-2">
      {events.map((e) => (
        <li key={e.id}>
          <button
            onClick={() => goToEvent(e)}
            className={`flex w-full gap-3 rounded-xl p-2 text-left transition hover:bg-white/[.05] ${selected === e.id ? 'bg-white/[.06] ring-1 ring-white/15' : ''}`}
          >
            <div className="h-12 w-12 shrink-0 rounded-lg" style={{ background: e.cover }} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-fog uppercase">
                {e.status === 'live' ? <><span className="live-dot" /> live</> : <span className="shrink-0 text-[#00c2ff]">{dayRange(e.startsAt, e.endsAt)}</span>}
                <span className="truncate">· {e.venue}</span>
              </div>
              <div className="truncate text-[13.5px] font-medium text-white">{e.title}</div>
              <div className="truncate text-[11px] text-white/45">
                {e.host}
                <SourceBadge source={e.source} />
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Mobile: a swipeable strip above the dock (the rail is desktop-only). */
export function EventStrip() {
  const events = useCityEvents()
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[calc(var(--dock-h)+12px)] z-20 lg:hidden">
      <div className="scroll-thin flex snap-x gap-2 overflow-x-auto px-3 pb-1">
        {events.map((e) => (
          <button key={e.id} onClick={() => goToEvent(e)} className="glass-strong flex w-[240px] shrink-0 snap-start gap-2.5 rounded-2xl p-2 text-left">
            <div className="h-11 w-11 shrink-0 rounded-lg" style={{ background: e.cover }} />
            <div className="min-w-0">
              <div className="font-mono text-[9.5px] tracking-[0.08em] text-[#00c2ff] uppercase">{e.status === 'live' ? 'live now' : dayRange(e.startsAt, e.endsAt)} · {e.venue}</div>
              <div className="truncate text-[13px] font-medium text-white">{e.title}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
