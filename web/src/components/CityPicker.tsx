import { useEffect, useRef, useState } from 'react'
import { reduced } from './bits'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useStore } from '../store'
import { cityFor } from '../data/mock'
import type { CityRow } from '../map/worldLayer'
import type { City } from '../lib/types'

const META: Record<string, { country: string }> = {
  ldn: { country: 'United Kingdom' },
  nyc: { country: 'United States' },
  sf: { country: 'California' },
  bgd: { country: 'Srbija' },
  ns: { country: 'Srbija' },
  rom: { country: 'Italia' },
}

/**
 * Find any city: the bundled list first, then Photon for everything else.
 * Always on screen. Open on the world map; inside a city it drops down into a thin line, and pressing the line pops it back up.
 */
function CitySearch({ onPick }: { onPick: (c: City) => void }) {
  const entered = useStore((s) => s.entered)
  const sheetOnPhone = useStore((s) => !!s.selectedCell || s.tab !== 'explore') && window.innerWidth < 1024
  const [up, setUp] = useState(!entered)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<CityRow[]>([])
  const [far, setFar] = useState<CityRow[]>([])
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const tl = useRef<gsap.core.Timeline | null>(null)

  // progress 0 = search open · 1 = folded into the line
  useGSAP(
    () => {
      tl.current = gsap
        .timeline({ paused: true })
        .to('.cs-field', { scaleX: 0.16, scaleY: 0.1, y: 15, duration: 0.5, ease: 'expo.inOut' }, 0)
        .to('.cs-field', { autoAlpha: 0, duration: 0.14 }, 0.34)
        .fromTo('.cs-line', { autoAlpha: 0, scaleX: 0.3 }, { autoAlpha: 1, scaleX: 1, duration: 0.42, ease: 'back.out(2.4)' }, 0.34)
      if (!up) tl.current.progress(1)
      if (!reduced()) gsap.to('.cs-glow', { xPercent: 240, duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true })
    },
    { scope: box },
  )

  useEffect(() => {
    const t = tl.current
    if (!t) return
    t.timeScale(reduced() ? 100 : up ? 1.15 : 1)
    if (up) {
      t.reverse()
    } else {
      t.play()
      input.current?.blur()
      setQ('')
    }
  }, [up])

  // the world map keeps it open; entering a city folds it a moment later
  useEffect(() => {
    if (!entered) return setUp(true)
    const t = setTimeout(() => setUp(false), 700)
    return () => clearTimeout(t)
  }, [entered])

  // inside a city: tapping away or Escape folds it again
  useEffect(() => {
    if (!up || !entered) return
    const away = (e: PointerEvent) => box.current?.contains(e.target as Node) || setUp(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setUp(false)
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc)
    }
  }, [up, entered])

  useEffect(() => {
    fetch('/world/cities.json').then((r) => r.json()).then(setRows).catch(() => {})
  }, [])
  const needle = q.trim().toLowerCase()
  const near = needle ? rows.filter((r) => r[0].toLowerCase().startsWith(needle)).slice(0, 5) : []
  useEffect(() => {
    setFar([])
    if (needle.length < 3) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(needle)}&limit=6&lang=en&layer=city`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((j: { features: { geometry: { coordinates: [number, number] }; properties: { name?: string; country?: string } }[] }) =>
          setFar(j.features.filter((f) => f.properties.name).map((f) => [f.properties.name!, f.properties.country ?? '', f.geometry.coordinates[0], f.geometry.coordinates[1], 0])),
        )
        .catch(() => {})
    }, 350)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [needle])
  const seen = new Set<string>()
  const list = [...near, ...far].filter((r) => {
    const k = `${r[0]}|${r[1]}`.toLowerCase()
    return !seen.has(k) && !!seen.add(k)
  }).slice(0, 6)
  return (
    <div ref={box} className={`pointer-events-auto relative h-[38px] w-full max-w-[340px] ${sheetOnPhone && !up ? 'hidden' : ''}`}>
      {up && list.length > 0 && (
        <ul className="glass-strong absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-2xl p-1" style={{ background: 'var(--panel-solid)' }} aria-label="Matching cities">
          {list.map((r) => (
            <li key={`${r[0]}${r[1]}${r[2]}`}>
              <button
                onClick={() => {
                  onPick(cityFor(r[0], r[1], r[2], r[3]))
                  if (entered) setUp(false)
                }}
                className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-white/10"
              >
                <span className="truncate text-[13px] text-white">{r[0]}</span>
                <span className="shrink-0 text-[11px] text-fog">{r[1]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cs-field absolute inset-0 origin-bottom">
        <input ref={input} tabIndex={up ? 0 : -1} className="input !rounded-full !py-2 text-center text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any city" aria-label="Search any city" autoComplete="off" />
      </div>
      <button
        onClick={() => {
          tl.current?.pause(0.3) // field visible again, so the same tap can focus it (phones open the keyboard only inside a tap)
          input.current?.focus({ preventScroll: true })
          setUp(true)
        }}
        aria-label="Open city search" aria-expanded={up} tabIndex={up ? -1 : 0} className="cs-line invisible absolute bottom-0 left-1/2 flex h-7 w-24 -translate-x-1/2 items-end justify-center pb-1">
        <span className="relative h-[5px] w-full overflow-hidden rounded-full bg-gradient-to-r from-[#9945ff] to-[#14f195] shadow-[0_0_12px_rgba(153,69,255,.6)]">
          <span className="cs-glow absolute inset-y-0 left-0 w-[30%] bg-white/60 blur-[2px]" />
        </span>
      </button>
    </div>
  )
}

/** World view → just the search box: picking a city plays the fly-in. Capitals and the launch cities are tapped on the map. */
export default function CityPicker() {
  const splashDone = useStore((s) => s.splashDone)
  const mapReady = useStore((s) => s.mapReady)
  const [flying, setFlying] = useState<City | null>(null)
  const fly = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!flying || !fly.current) return
      gsap
        .timeline({ onComplete: () => setFlying(null) })
        .fromTo('.fly-k', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' })
        .fromTo('.fly-n', { opacity: 0, scale: 1.25, letterSpacing: '0.4em', filter: 'blur(16px)' }, { opacity: 1, scale: 1, letterSpacing: '-0.02em', filter: 'blur(0px)', duration: 1.6, ease: 'expo.out' }, 0.1)
        .fromTo('.fly-d', { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.7)
        .to(fly.current, { opacity: 0, scale: 0.92, filter: 'blur(10px)', duration: 1.1, ease: 'power2.in' }, 3.0)
    },
    { scope: fly, dependencies: [flying] },
  )

  return (
    <>
      {splashDone && mapReady && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+14px)] z-40 flex justify-center px-3">
          <CitySearch
            onPick={(c) => {
              setFlying(c)
              useStore.getState().openCity(c)
            }}
          />
        </div>
      )}
      {flying && (
        <div ref={fly} className="pointer-events-none fixed inset-0 z-40 grid place-items-center text-center">
          <div>
            <div className="fly-k font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">Flying in · {META[flying.id]?.country ?? flying.district}</div>
            <div className="fly-n font-display mt-2 text-[14vw] leading-none font-bold text-white [text-shadow:0_0_60px_rgba(153,69,255,.55)] md:text-[120px]">{flying.name}</div>
            <div className="fly-d mt-3 text-[13px] text-white/60">{flying.district}</div>
          </div>
        </div>
      )}
    </>
  )
}
