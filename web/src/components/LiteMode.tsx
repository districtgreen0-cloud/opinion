import { useMemo } from 'react'
import { useStore } from '../store'
import { CITIES } from '../data/mock'
import { ago, dayRange } from '../lib/format'
import { kindOf } from '../lib/types'
import { useCityEvents } from './EventList'
import { Avatar, SourceBadge } from './bits'
import Logo from './Logo'

/** WebGL2 is required by the 3D map (MapLibre + deck.gl + three.js). */
export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

const isBrave = () => !!(navigator as Navigator & { brave?: unknown }).brave || /Brave/i.test(navigator.userAgent)

/** Shown when the browser has WebGL switched off (Brave Shields, Lockdown Mode…): events + live feed, no map. */
export default function LiteMode() {
  const city = useStore((s) => s.city)
  const setCity = useStore((s) => s.setCity)
  const comments = useStore((s) => s.comments)
  const events = useCityEvents()
  const feed = useMemo(() => comments.filter((c) => kindOf(c) !== 'reply').slice(0, 30), [comments])
  const brave = isBrave()

  return (
    <div className="h-full overflow-y-auto bg-black px-4 pt-[max(18px,env(safe-area-inset-top))] pb-10">
      <div className="mx-auto max-w-[560px]">
        <header className="flex items-center justify-between py-2">
          <Logo size={22} />
          <select
            value={city.id}
            onChange={(e) => setCity(e.target.value as typeof city.id)}
            className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[13px] text-white"
            aria-label="City"
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </header>

        <section className="mt-4 rounded-[20px] border border-white/10 bg-white/[.03] p-5">
          <div className="font-mono text-[10.5px] tracking-[0.18em] text-[#14f195] uppercase">Lite mode · 3D map off</div>
          <h1 className="font-display mt-2 text-[22px] leading-tight font-semibold text-white">This browser has WebGL turned off, so the 3D city can't draw.</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/65">Everything else still works below. To get the map back:</p>
          <ol className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-white/85">
            {brave && (
              <li>
                <b className="text-white">Brave:</b> tap the <b>lion icon</b> in the address bar, then turn <b>Shields off for this site</b> (or set <i>Block fingerprinting</i> to Standard). Reload.
              </li>
            )}
            <li>
              <b className="text-white">Lockdown Mode on?</b> It disables WebGL. In Safari: <b>aA → Website Settings</b> → turn Lockdown Mode off for this site. For other browsers: Settings → Privacy &amp; Security → Lockdown Mode → Configure Web Browsing.
            </li>
            {!brave && (
              <li>
                <b className="text-white">Other blockers:</b> privacy or anti-fingerprinting extensions can disable WebGL. Allow this site, then reload.
              </li>
            )}
            <li>
              <b className="text-white">Or open the link in Safari.</b>
            </li>
          </ol>
          <button onClick={() => location.reload()} className="btn-ghost mt-4 w-full text-[14px]">
            Reload
          </button>
        </section>

        <h2 className="mt-8 mb-3 font-mono text-[11px] tracking-[0.2em] text-fog uppercase">{city.name} · events</h2>
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 rounded-2xl border border-white/[.07] bg-white/[.02] p-3">
              <div className="h-14 w-14 shrink-0 rounded-xl" style={{ background: e.cover }} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] tracking-[0.08em] text-[#00c2ff] uppercase">
                  {e.status === 'live' ? 'live now' : dayRange(e.startsAt, e.endsAt)} · {e.venue}
                </div>
                <div className="text-[14.5px] leading-snug font-medium text-white">{e.title}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11.5px] text-white/45">
                  <span className="truncate">
                    {e.host}
                    <SourceBadge source={e.source} />
                  </span>
                  <a href={e.lumaUrl} target="_blank" rel="noreferrer" className="shrink-0 text-white/80 underline-offset-2 hover:underline">
                    Tickets ↗
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 mb-3 font-mono text-[11px] tracking-[0.2em] text-fog uppercase">Live voices</h2>
        <ul className="space-y-1">
          {feed.map((c) => (
            <li key={c.id} className="flex gap-2.5 rounded-xl p-2">
              <Avatar id={c.avatar} handle={c.handle} size={26} />
              <div className="min-w-0">
                <div className="text-[11px] text-fog">
                  <span className="text-white/80">{c.handle}</span> · {ago(c.createdAt)}
                </div>
                <p className="text-[13.5px] leading-snug text-white/85">
                  {kindOf(c) === 'job' ? `💼 ${c.priceUsdc} USDC · ${c.title}` : kindOf(c) === 'topic' ? `💬 ${c.title}` : c.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-[11px] text-white/25">Posting is location-gated and needs the map. Enable WebGL to post.</p>
      </div>
    </div>
  )
}
