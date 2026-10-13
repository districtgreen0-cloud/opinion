import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { cityData } from '../data/mock'
import { km, fmtKm, timeLabel, nf } from '../lib/format'
import { Avatar, Panel, SourceBadge } from './bits'

export default function EventsPanel() {
  const city = useStore((s) => s.city)
  const pos = useStore((s) => s.pos)
  const plans = useStore((s) => s.plans)
  const selected = useStore((s) => s.selectedEventId)
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming'>('all')
  const s = useStore.getState
  const d = useMemo(() => cityData(city), [city])
  const [clng, clat] = city.center
  const list = d.events.filter((e) => filter === 'all' || e.status === filter)

  return (
    <Panel kicker={`${city.name} · tonight`} title="Events" onClose={() => s().setTab('explore')}>
      <div className="mb-4 flex gap-2">
        {(['all', 'live', 'upcoming'] as const).map((f) => (
          <button key={f} className="chip capitalize" data-on={filter === f} onClick={() => setFilter(f)}>
            {f === 'live' && <span className="live-dot" />}
            {f === 'upcoming' && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
            {f}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {list.map((e) => {
          const friends = d.friends.filter((f) => f.goingTo === e.id)
          const dist = km(pos?.lat ?? clat, pos?.lng ?? clng, e.lat, e.lng)
          const plan = plans[e.id]
          return (
            <article
              key={e.id}
              className={`overflow-hidden rounded-[18px] border transition ${selected === e.id ? 'border-white/25' : 'hairline'} bg-white/[.02]`}
            >
              <button
                className="block w-full text-left"
                onClick={() => {
                  s().selectEvent(e.id)
                  s().flyTo(e.lng, e.lat, 16.6)
                }}
              >
                <div className="relative h-24" style={{ background: e.cover }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] backdrop-blur">
                    {e.status === 'live' ? <><span className="live-dot" /> LIVE</> : <span className="text-mint">{timeLabel(e.startsAt).toUpperCase()}</span>}
                  </div>
                  <div className="absolute right-3 bottom-2 text-[11px] text-white/70">{fmtKm(dist)}</div>
                </div>
                <div className="px-4 pt-3">
                  <h3 className="font-display text-[17px] font-semibold leading-tight text-white">{e.title}</h3>
                  <p className="mt-0.5 text-[12px] text-fog">
                    {e.host} · {e.venue}
                    {e.attendees > 0 && (
                      <>
                        {' '}· <span className="num text-white/70">{nf(e.attendees)}</span> going
                      </>
                    )}
                    <SourceBadge source={e.source} />
                  </p>
                  {friends.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {friends.slice(0, 4).map((f) => (
                          <Avatar key={f.id} id={f.avatar} handle={f.handle} size={22} ring="#000" />
                        ))}
                      </div>
                      <span className="text-[11px] text-white/70">
                        {friends.length} friend{friends.length > 1 ? 's' : ''} going
                      </span>
                    </div>
                  )}
                </div>
              </button>
              <div className="flex flex-wrap gap-2 p-4 pt-3">
                <button className="chip" data-on={plan === 'going'} onClick={() => { s().setPlan(e.id, plan === 'going' ? null : 'going'); if (plan !== 'going') s().toast('Your crew can see you\'re going', 'violet') }}>
                  {plan === 'going' ? '✓ Going' : 'Going'}
                </button>
                <button className="chip" data-on={plan === 'interested'} onClick={() => s().setPlan(e.id, plan === 'interested' ? null : 'interested')}>
                  Interested
                </button>
                <button
                  className="chip"
                  onClick={() => {
                    s().joinCrew(e.id)
                    s().openCrew(e.id)
                  }}
                >
                  Join crew
                </button>
                <a className="chip ml-auto !border-white/25 !text-white" href={e.lumaUrl} target="_blank" rel="noreferrer">
                  {e.source === 'luma' ? 'Open on Luma ↗' : e.source === 'eventbrite' ? 'Open on Eventbrite ↗' : 'Get tickets ↗'}
                </a>
              </div>
            </article>
          )
        })}
      </div>
    </Panel>
  )
}
