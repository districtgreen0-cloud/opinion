import { useState } from 'react'
import { useStore } from '../store'
import { cellCenter, shortCell } from '../lib/h3'
import { ago } from '../lib/format'
import { Avatar, Icon } from './bits'
import { kindOf } from '../lib/types'
import { EventRail } from './EventList'
import { SportsRail } from './SportsList'
import { Person } from './Profile'

export default function FeedRail() {
  const comments = useStore((s) => s.comments)
  const filter = useStore((s) => s.homeFilter)
  const [open, setOpen] = useState(true)
  const s = useStore.getState
  return (
    <aside className="pointer-events-auto absolute top-[84px] right-4 bottom-[calc(var(--dock-h)+330px)] z-10 hidden w-[300px] flex-col lg:flex">
      <button onClick={() => setOpen((o) => !o)} className="glass mb-2 flex h-10 items-center justify-between rounded-2xl px-4 text-[12px] text-white/80">
        <span className="flex items-center gap-2">
          <span className="live-dot" /> {filter === 'all' ? 'Live voices' : filter === 'event' ? 'Events' : filter === 'sport' ? 'Sports' : filter === 'topic' ? 'Topics' : filter === 'note' ? 'Notes' : 'Jobs'}
        </span>
        <Icon name="feed" className="h-4 w-4 text-fog" />
      </button>
      {open && filter === 'event' && <EventRail />}
      {open && filter === 'sport' && <SportsRail />}
      {open && filter !== 'event' && filter !== 'sport' && (
        <ul className="glass scroll-thin flex-1 space-y-1 overflow-y-auto rounded-[20px] p-2" style={{ maskImage: 'linear-gradient(#000 85%, transparent)' }}>
          {comments.filter((c) => kindOf(c) !== 'reply' && (filter === 'all' || kindOf(c) === filter)).slice(0, 40).map((c) => (
            <li key={c.id} className="flex animate-[toast_.6s_var(--ease-expo)] gap-0.5 rounded-xl hover:bg-white/[.04]">
              <Person handle={c.handle} avatar={c.avatar} className="mt-2 ml-2 self-start">
                <Avatar id={c.avatar} handle={c.handle} size={26} />
              </Person>
              <button
                onClick={() => {
                  const [lng, lat] = cellCenter(c.cell)
                  s().flyTo(lng, lat, 16.8)
                  s().setHexTab(kindOf(c) === 'job' ? 'job' : kindOf(c) === 'topic' ? 'topic' : 'note')
                  s().selectCell(c.cell)
                  s().setTab('explore')
                }}
                className="flex min-w-0 flex-1 gap-2.5 rounded-xl p-2 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-fog">
                    <span className="text-white/80">{c.handle}</span>· {ago(c.createdAt)} · <span className="num">{shortCell(c.cell)}</span>
                  </div>
                  {kindOf(c) === 'job' ? (
                    <p className="text-[13px] leading-snug text-white/85">
                      <span className="mr-1 rounded-md border border-mint/30 px-1 text-[10px] text-mint">JOB</span>
                      {c.title} · <span className="num text-white">{c.priceUsdc} USDC</span>
                    </p>
                  ) : kindOf(c) === 'topic' ? (
                    <p className="text-[13px] leading-snug text-white/85">
                      <span className="mr-1 rounded-md border border-violet/40 px-1 text-[10px] text-violet">TOPIC</span>
                      {c.title}
                    </p>
                  ) : (
                    <p className="text-[13px] leading-snug text-white/85">{c.text}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
