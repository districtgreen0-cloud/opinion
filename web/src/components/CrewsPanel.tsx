import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { cityData, HANDLES } from '../data/mock'
import { ago, uid } from '../lib/format'
import { Avatar, Panel } from './bits'
import { Person } from './Profile'

export default function CrewsPanel() {
  const city = useStore((s) => s.city)
  const crewId = useStore((s) => s.crewEventId)
  const joined = useStore((s) => s.joinedCrews)
  const crews = useStore((s) => s.crews)
  const me = useStore((s) => s.me)
  const s = useStore.getState
  const d = useMemo(() => cityData(city), [city])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)

  const active = d.events.find((e) => e.id === crewId)
  const msgs = useMemo(() => crews.filter((m) => m.eventId === crewId), [crews, crewId])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length])

  if (!active)
    return (
      <Panel kicker="Event group chats" title="Crews" onClose={() => s().setTab('explore')}>
        <p className="mb-4 text-[13px] text-fog">Every event has a crew. See who's going, plan the night, wave to strangers.</p>
        <div className="space-y-2">
          {d.events.map((e) => {
            const last = [...crews].reverse().find((m) => m.eventId === e.id)
            const isIn = joined.includes(e.id)
            return (
              <button key={e.id} onClick={() => s().openCrew(e.id)} className="flex w-full items-center gap-3 rounded-2xl border hairline p-3 text-left hover:bg-white/[.03]">
                <div className="relative h-11 w-11 shrink-0 rounded-xl" style={{ background: e.cover }}>
                  {e.status === 'live' && <span className="live-dot absolute -top-0.5 -right-0.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-white">{e.title}</span>
                    {last && <span className="shrink-0 text-[11px] text-fog">{ago(last.createdAt)}</span>}
                  </div>
                  <p className="truncate text-[12px] text-fog">{last ? `${last.handle}: ${last.text}` : 'No messages yet'}</p>
                </div>
                {isIn && <span className="h-2 w-2 shrink-0 rounded-full bg-ember shadow-[0_0_8px_#ff5a1f]" />}
              </button>
            )
          })}
        </div>
      </Panel>
    )

  const members = HANDLES.slice(0, 10)
  const send = (body: string, wave = false) => {
    s().joinCrew(active.id)
    s().addCrewMessage({ id: uid(), eventId: active.id, handle: me.handle, avatar: me.avatar, text: body, createdAt: Date.now(), wave })
  }

  return (
    <Panel
      kicker={`Crew · ${active.attendees} going`}
      title={active.title}
      onClose={() => s().openCrew(null)}
      right={active.status === 'live' ? <span className="chip"><span className="live-dot" /> live</span> : undefined}
    >
      <div className="scroll-thin -mx-5 mb-3 flex gap-3 overflow-x-auto px-5 pb-1">
        {members.map((h, i) => (
          <button
            key={h}
            className="flex w-14 shrink-0 flex-col items-center gap-1"
            onClick={() => {
              send(`👋 hey ${h}`, true)
              s().toast(`You waved at ${h}`, 'violet')
            }}
            title={`Wave at ${h}`}
          >
            <div className="relative">
              <Avatar id={`av:${i % 8}`} handle={h} size={40} />
              {i % 3 !== 2 && <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-black bg-mint" />}
            </div>
            <span className="w-full truncate text-center text-[10px] text-fog">{h}</span>
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-white/30">Tap anyone to send a “Hey 👋”.</p>
      <ul className="space-y-3">
        {msgs.map((m) => {
          const mine = m.handle === me.handle
          return (
            <li key={m.id} className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && (
                <Person handle={m.handle} avatar={m.avatar} className="self-start">
                  <Avatar id={m.avatar} handle={m.handle} size={26} />
                </Person>
              )}
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? 'border border-white/15 text-white bg-gradient-to-b from-white/[.14] to-white/[.03] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,.18)]' : 'bg-white/[.05] text-white/90'} ${m.wave ? 'text-[16px]' : 'text-[13px]'}`}>
                {!mine && <div className="mb-0.5 text-[10px] text-fog">{m.handle} · {ago(m.createdAt)}</div>}
                {m.text}
              </div>
            </li>
          )
        })}
      </ul>
      <div ref={end} />
      <form
        className="sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t hairline bg-[var(--sheet-foot)] px-5 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          send(text.trim())
          setText('')
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the crew…" aria-label="Message" />
        <button className="btn-ember shrink-0" disabled={!text.trim()}>Send</button>
      </form>
    </Panel>
  )
}
