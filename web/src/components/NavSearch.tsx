import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { mapHandle } from '../map/Map3D'
import { fmtDist, meters, searchPlaces, type LngLat, type NavMode, type Place } from '../lib/route'
import { reduced } from './bits'

/** "Where to?" — search any place or address (OpenStreetMap data), pick a mode, go. */
export default function NavSearch() {
  const open = useStore((s) => s.navSearch)
  const setOpen = useStore((s) => s.setNavSearch)
  const pos = useStore((s) => s.pos)
  const city = useStore((s) => s.city)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<NavMode>('foot')
  const [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setResults([])
    setErr(null)
    setTimeout(() => input.current?.focus(), 50)
    if (card.current && !reduced()) gsap.fromTo(card.current, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'expo.out' })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [open, setOpen])

  // search as you type (debounced), biased to the map centre
  useEffect(() => {
    if (!open || q.trim().length < 2) return setResults([])
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setBusy(true)
      setErr(null)
      try {
        const c = mapHandle.current?.getCenter()
        const near: LngLat = c ? [c.lng, c.lat] : city.center
        setResults(await searchPlaces(q.trim(), near, ac.signal))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr('Search is unreachable right now.')
      } finally {
        setBusy(false)
      }
    }, 280)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [q, open, city.center])

  if (!open) return null
  const here: LngLat | null = pos ? [pos.lng, pos.lat] : null
  const go = (p: Place) => useStore.getState().startNav(p.at, p.name, mode)

  return (
    <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} role="presentation">
      <div ref={card} className="glass-strong absolute inset-x-2 top-[62px] mx-auto max-w-[520px] rounded-2xl p-3 md:top-[76px]" style={{ background: 'var(--panel-solid)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Where to?">
        <div className="flex items-center gap-2">
          <span className="text-[16px]">🧭</span>
          <input
            ref={input}
            className="input !py-2.5"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Where to? Address, venue, street…"
            aria-label="Destination"
            autoComplete="off"
          />
          <button onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          {(['foot', 'bike', 'car'] as NavMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-1.5 text-[11.5px] transition ${mode === m ? 'bg-white/[.12] text-white ring-1 ring-white/20' : 'text-fog hover:text-white'}`} aria-pressed={mode === m}>
              {m === 'foot' ? '🚶 Walk' : m === 'bike' ? '🚲 Bike' : '🚗 Drive'}
            </button>
          ))}
        </div>
        {busy && <p className="mt-2 px-1 font-mono text-[10px] tracking-[0.14em] text-fog uppercase">Searching…</p>}
        {err && <p className="mt-2 px-1 text-[12px] text-[#ff8a8a]">{err}</p>}
        {results.length > 0 && (
          <ul className="scroll-thin mt-2 max-h-[46vh] space-y-0.5 overflow-y-auto">
            {results.map((p, i) => (
              <li key={i}>
                <button onClick={() => go(p)} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/[.06]">
                  <span className="mt-0.5 text-[14px]">📍</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-white">{p.name}</span>
                    <span className="block truncate text-[11px] text-fog">{p.detail}</span>
                  </span>
                  {here && <span className="num shrink-0 text-[11px] text-white/50">{fmtDist(meters(here, p.at))}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!results.length && q.trim().length < 2 && (
          <p className="mt-2 px-1 text-[11.5px] text-fog">Tip: you can also tap any spot on the map and choose “Navigate here”.</p>
        )}
        <p className="mt-2 px-1 text-[9px] text-white/25">Places © OpenStreetMap contributors · search by Photon</p>
      </div>
    </div>
  )
}
