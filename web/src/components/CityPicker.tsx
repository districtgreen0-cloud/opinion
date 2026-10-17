import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useStore } from '../store'
import { CITIES } from '../data/mock'
import type { City } from '../lib/types'
import { reduced } from './bits'

const META: Record<City['id'], { country: string; c: string }> = {
  ldn: { country: 'United Kingdom', c: '#14f195' },
  nyc: { country: 'United States', c: '#00c2ff' },
  sf: { country: 'California', c: '#ff8a1f' },
  bgd: { country: 'Srbija', c: '#e7c88c' },
  ns: { country: 'Srbija', c: '#b26bff' },
}

/** World view → one thin strip of cities: tap to preview, tap again (or Fly in) to dive into the streets. */
export default function CityPicker() {
  const open = useStore((s) => s.pickerOpen)
  const entered = useStore((s) => s.entered)
  const splashDone = useStore((s) => s.splashDone)
  const mapReady = useStore((s) => s.mapReady)
  const setOpen = useStore((s) => s.setPickerOpen)
  const [sel, setSel] = useState<City>(() => useStore.getState().city)
  const [flying, setFlying] = useState<City | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const fly = useRef<HTMLDivElement>(null)

  // the world map gets a moment on its own, then the strip rises
  useEffect(() => {
    if (!splashDone || !mapReady || entered) return
    const t = setTimeout(() => useStore.getState().entered || setOpen(true), 1200)
    return () => clearTimeout(t)
  }, [splashDone, mapReady, entered, setOpen])

  // the map pans to whichever city is selected
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => useStore.getState().peekCity(sel.center), 120)
    return () => clearTimeout(t)
  }, [sel, open])

  // keep the selected chip in view on narrow screens
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-id="${sel.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced() ? 'auto' : 'smooth' })
  }, [sel, open])

  useGSAP(
    () => {
      if (!open || !root.current || reduced()) return
      gsap.from(root.current.querySelector('.cp-panel'), { y: 28, opacity: 0, filter: 'blur(10px)', duration: 0.7, ease: 'expo.out' })
      gsap.from(root.current.querySelectorAll('.cp-chip'), { y: 8, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'expo.out', delay: 0.15 })
    },
    { scope: root, dependencies: [open] },
  )

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

  const choose = (c: City = sel) => {
    const go = () => {
      setFlying(c)
      useStore.getState().enterCity(c.id)
    }
    const panel = root.current?.querySelector('.cp-panel')
    if (reduced() || !panel) return go()
    gsap.to(panel, { y: 20, opacity: 0, filter: 'blur(8px)', duration: 0.35, ease: 'power2.in', onComplete: go })
  }
  const move = (d: number) => {
    const i = CITIES.findIndex((c) => c.id === sel.id)
    setSel(CITIES[(i + d + CITIES.length) % CITIES.length]!)
  }

  return (
    <>
      {open && !entered && (
        <div ref={root} className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+14px)] z-40 flex justify-center px-2">
          <div
            className="cp-panel glass-strong pointer-events-auto flex w-full max-w-[600px] items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3"
            style={{ background: 'var(--panel-solid)' }}
            role="dialog"
            aria-label="Choose your city"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') move(-1)
              else if (e.key === 'ArrowRight') move(1)
              else if (e.key === 'Enter') choose()
              else if (e.key === 'Escape') setOpen(false)
            }}
          >
            <span className="hidden shrink-0 font-mono text-[9px] tracking-[0.22em] text-fog uppercase sm:inline">City</span>
            <div ref={strip} className="scroll-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="listbox" aria-label="Cities" aria-activedescendant={`cp-${sel.id}`}>
              {CITIES.map((c) => {
                const on = c.id === sel.id
                return (
                  <button
                    key={c.id}
                    id={`cp-${c.id}`}
                    data-id={c.id}
                    role="option"
                    aria-selected={on}
                    onClick={() => (on ? choose(c) : setSel(c))}
                    onDoubleClick={() => choose(c)}
                    className={`cp-chip flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-[background,color,box-shadow] ${on ? 'bg-white/[.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.22)]' : 'text-white/60 hover:bg-white/[.06] hover:text-white'}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: META[c.id].c, boxShadow: on ? `0 0 8px ${META[c.id].c}` : 'none' }} />
                    {c.name}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => choose()}
              className="shrink-0 rounded-full bg-gradient-to-r from-[#9945ff] to-[#14f195] px-3.5 py-1.5 text-[12.5px] font-semibold text-black transition-[filter] hover:brightness-110"
            >
              Fly in →
            </button>
            <button onClick={() => setOpen(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] text-white/45 hover:bg-white/10 hover:text-white" aria-label="Keep exploring the world map">
              ✕
            </button>
          </div>
        </div>
      )}
      {!open && !entered && splashDone && mapReady && (
        <button onClick={() => setOpen(true)} className="btn-black pointer-events-auto fixed bottom-[calc(var(--dock-h)+16px)] left-1/2 z-30 -translate-x-1/2 !rounded-full text-[13px]">
          Choose your city
        </button>
      )}
      {flying && (
        <div ref={fly} className="pointer-events-none fixed inset-0 z-40 grid place-items-center text-center">
          <div>
            <div className="fly-k font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">Flying in · {META[flying.id].country}</div>
            <div className="fly-n font-display mt-2 text-[14vw] leading-none font-bold text-white [text-shadow:0_0_60px_rgba(153,69,255,.55)] md:text-[120px]">{flying.name}</div>
            <div className="fly-d mt-3 text-[13px] text-white/60">{flying.district}</div>
          </div>
        </div>
      )}
    </>
  )
}
