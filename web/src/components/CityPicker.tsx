import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useStore } from '../store'
import { CITIES, cityData } from '../data/mock'
import type { City } from '../lib/types'
import { reduced } from './bits'

const META: Record<City['id'], { country: string; short: string; tz: string; c: string }> = {
  ldn: { country: 'United Kingdom', short: 'UK', tz: 'Europe/London', c: '#14f195' },
  nyc: { country: 'United States', short: 'USA', tz: 'America/New_York', c: '#00c2ff' },
  sf: { country: 'California', short: 'CA · USA', tz: 'America/Los_Angeles', c: '#ff8a1f' },
  bgd: { country: 'Srbija', short: 'Srbija', tz: 'Europe/Belgrade', c: '#e7c88c' },
  ns: { country: 'Srbija', short: 'Srbija', tz: 'Europe/Belgrade', c: '#b26bff' },
}
const clock = (tz: string) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date())

// the reel: the city list twice round a 3D drum
const FACES = [...CITIES, ...CITIES]
const STEP = 360 / FACES.length
const FACE_H = 46
const RADIUS = Math.round(FACE_H / 2 / Math.tan(Math.PI / FACES.length))
const mod = (n: number, m: number) => ((n % m) + m) % m
const faceAt = (rot: number) => mod(Math.round(rot / STEP), FACES.length)

/** World view → a small slot-machine reel: roll / flick / pull the lever, then dive into the city. */
export default function CityPicker() {
  const open = useStore((s) => s.pickerOpen)
  const entered = useStore((s) => s.entered)
  const splashDone = useStore((s) => s.splashDone)
  const mapReady = useStore((s) => s.mapReady)
  const setOpen = useStore((s) => s.setPickerOpen)
  const games = useStore((s) => s.games)
  const [face, setFace] = useState(() => Math.max(0, CITIES.findIndex((c) => c.id === useStore.getState().city.id)))
  const [flying, setFlying] = useState<City | null>(null)
  const [spinning, setSpinning] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const drum = useRef<HTMLDivElement>(null)
  const lever = useRef<HTMLButtonElement>(null)
  const fly = useRef<HTMLDivElement>(null)
  const rot = useRef({ v: face * STEP })
  const city = FACES[face]!

  // the globe gets a moment on its own, then the reel rises
  useEffect(() => {
    if (!splashDone || !mapReady || entered) return
    const t = setTimeout(() => useStore.getState().entered || setOpen(true), 1600)
    return () => clearTimeout(t)
  }, [splashDone, mapReady, entered, setOpen])

  // face i sits at rotateX(-i·STEP); turning the drum by +i·STEP brings it to the window
  const render = useCallback(() => {
    const d = drum.current
    if (d) {
      d.style.transform = `rotateX(${rot.current.v}deg)`
      // fade faces by angle (and hide the back of the drum) — doesn't rely on backface-visibility, which WebKit ignores here
      Array.from(d.children as HTMLCollectionOf<HTMLElement>).forEach((el, i) => {
        const a = Math.abs(mod(rot.current.v - i * STEP + 180, 360) - 180)
        el.style.opacity = a > 80 ? '0' : String(Math.cos((a * Math.PI) / 180) ** 1.5)
      })
    }
    const f = faceAt(rot.current.v)
    setFace((cur) => (cur === f ? cur : f))
  }, [])

  // every time the reel settles, the globe turns to that city
  const settled = useRef(-1)
  useEffect(() => {
    if (!open || spinning || settled.current === face % CITIES.length) return
    const t = setTimeout(() => {
      settled.current = face % CITIES.length
      useStore.getState().peekCity(FACES[face]!.center)
    }, 220)
    return () => clearTimeout(t)
  }, [face, open, spinning])

  const snapTo = useCallback(
    (target: number, duration = 0.5, ease = 'back.out(1.6)') => {
      gsap.to(rot.current, { v: Math.round(target / STEP) * STEP, duration: reduced() ? 0 : duration, ease, onUpdate: render, overwrite: true })
    },
    [render],
  )
  const step = useCallback((d: number) => snapTo(Math.round(rot.current.v / STEP) * STEP + d * STEP, 0.45), [snapTo])

  const spin = useCallback(() => {
    if (spinning) return
    setSpinning(true)
    if (lever.current && !reduced()) gsap.timeline().to(lever.current, { rotate: 38, duration: 0.18, ease: 'power2.in' }).to(lever.current, { rotate: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' })
    // 3–4 full turns, landing on a different city
    const cur = face % CITIES.length
    const landing = (cur + 1 + Math.floor(Math.random() * (CITIES.length - 1))) % CITIES.length
    const turns = (3 + Math.floor(Math.random() * 2)) * 360
    const target = rot.current.v + turns + mod(landing - cur, CITIES.length) * STEP
    gsap.to(rot.current, {
      v: Math.round(target / STEP) * STEP,
      duration: reduced() ? 0 : 2.6,
      ease: 'power4.out',
      onUpdate: render,
      overwrite: true,
      onComplete: () => {
        setSpinning(false)
        const win = root.current?.querySelector('.cp-win')
        if (win && !reduced()) gsap.fromTo(win, { boxShadow: '0 0 0 1px rgba(20,241,149,.9), 0 0 34px rgba(20,241,149,.55)' }, { boxShadow: '0 0 0 1px rgba(255,255,255,.12), 0 0 0px rgba(20,241,149,0)', duration: 1.2 })
      },
    })
  }, [face, render, spinning])

  // drag / flick the reel
  const drag = useRef<{ y: number; v: number; t: number; last: number; vel: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    gsap.killTweensOf(rot.current)
    drag.current = { y: e.clientY, v: rot.current.v, t: performance.now(), last: rot.current.v, vel: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    const nv = d.v - ((e.clientY - d.y) / FACE_H) * STEP // drag down pulls the city above into the window
    d.vel = (nv - d.last) / Math.max(1, now - d.t)
    d.t = now
    d.last = nv
    rot.current.v = nv
    render()
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    // flick: carry the velocity (only if the finger was still moving when it let go), then settle on a face
    const vel = performance.now() - d.t > 90 ? 0 : d.vel
    snapTo(rot.current.v + vel * 260, Math.min(1.6, 0.4 + Math.abs(vel) * 2), 'power3.out')
  }
  const wheelAcc = useRef(0)
  const onWheel = (e: React.WheelEvent) => {
    wheelAcc.current += e.deltaY
    if (Math.abs(wheelAcc.current) < 40) return
    step(Math.sign(wheelAcc.current))
    wheelAcc.current = 0
  }

  useGSAP(
    () => {
      if (!open || !root.current) return
      render()
      if (reduced()) return
      gsap.from(root.current.querySelector('.cp-panel'), { y: 40, scale: 0.9, opacity: 0, filter: 'blur(12px)', duration: 0.8, ease: 'expo.out' })
      // a little intro roll so it reads as a reel
      gsap.fromTo(rot.current, { v: rot.current.v - 2 * 360 }, { v: rot.current.v, duration: 1.8, ease: 'power4.out', onUpdate: render, delay: 0.2 })
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
        .to(fly.current, { opacity: 0, scale: 0.92, filter: 'blur(10px)', duration: 1.1, ease: 'power2.in' }, 3.4)
    },
    { scope: fly, dependencies: [flying] },
  )

  const choose = () => {
    const c = city
    const go = () => {
      setFlying(c)
      useStore.getState().enterCity(c.id)
    }
    const panel = root.current?.querySelector('.cp-panel')
    if (reduced() || !panel) return go()
    gsap.to(panel, { y: 30, scale: 0.92, opacity: 0, filter: 'blur(10px)', duration: 0.45, ease: 'power2.in', onComplete: go })
  }

  const ev = cityData(city).events.length
  const gm = games[city.id]?.length
  return (
    <>
      {open && !entered && (
        <div ref={root} className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+14px)] z-40 flex justify-center px-3">
          <div
            className="cp-panel glass-strong pointer-events-auto w-[272px] rounded-[24px] p-3.5"
            style={{ background: 'var(--panel-solid)' }}
            role="dialog"
            aria-label="Choose your city"
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') step(-1)
              else if (e.key === 'ArrowDown') step(1)
              else if (e.key === 'Enter') choose()
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[9px] tracking-[0.24em] text-fog uppercase">Where do you stand?</div>
                <h2 className="font-display text-[17px] leading-tight font-bold tracking-[-0.02em] text-white">
                  Choose your <span className="sol-n">city</span>
                </h2>
              </div>
              <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-full text-[13px] text-white/50 hover:bg-white/10 hover:text-white" aria-label="Keep exploring the globe">
                ✕
              </button>
            </div>

            <div className="mt-2.5 flex items-stretch gap-2">
              {/* the reel */}
              <div
                className="cp-win relative h-[132px] flex-1 cursor-grab touch-none overflow-hidden rounded-2xl bg-black/60 ring-1 ring-white/12 select-none active:cursor-grabbing"
                style={{ perspective: '420px' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onWheel={onWheel}
                role="listbox"
                aria-label="Cities"
                aria-activedescendant={`cp-${city.id}`}
                tabIndex={0}
              >
                <div ref={drum} className="absolute inset-x-0 top-1/2 -mt-[23px] h-[46px]" style={{ transformStyle: 'preserve-3d' }}>
                  {FACES.map((c, i) => (
                    <div
                      key={i}
                      id={i < CITIES.length ? `cp-${c.id}` : undefined}
                      role="option"
                      aria-selected={i === face}
                      className="absolute inset-0 flex items-center justify-center gap-2 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                      style={{ transform: `rotateX(${-i * STEP}deg) translateZ(${RADIUS}px)` }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: META[c.id].c, boxShadow: `0 0 10px ${META[c.id].c}` }} />
                      <span className="font-display text-[21px] font-bold tracking-[-0.02em] text-white">{c.name}</span>
                    </div>
                  ))}
                </div>
                {/* slot window: lit rails + fade top/bottom */}
                <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(var(--color-black) 0%, color-mix(in oklab, var(--color-black) 55%, transparent) 30%, transparent 42%, transparent 58%, color-mix(in oklab, var(--color-black) 55%, transparent) 70%, var(--color-black) 100%)' }} />
                <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 -mt-[23px] h-px bg-gradient-to-r from-transparent via-[#9945ff] to-transparent" />
                <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 mt-[23px] h-px bg-gradient-to-r from-transparent via-[#14f195] to-transparent" />
                <button onClick={() => step(-1)} onPointerDown={(e) => e.stopPropagation()} className="absolute top-1 left-1/2 -translate-x-1/2 px-3 text-[10px] text-white/40 hover:text-white" aria-label="Previous city">
                  ▲
                </button>
                <button onClick={() => step(1)} onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-1 left-1/2 -translate-x-1/2 px-3 text-[10px] text-white/40 hover:text-white" aria-label="Next city">
                  ▼
                </button>
              </div>

              {/* the lever */}
              <div className="flex w-9 flex-col items-center justify-end rounded-2xl bg-white/[.04] pb-2 ring-1 ring-white/10">
                <button ref={lever} onClick={spin} disabled={spinning} aria-label="Pull the lever to spin" className="relative flex h-[104px] w-full origin-bottom flex-col items-center">
                  <span className="h-5 w-5 rounded-full bg-gradient-to-br from-[#9945ff] to-[#14f195] shadow-[0_0_16px_rgba(153,69,255,.8)]" />
                  <span className="w-[3px] flex-1 rounded-full bg-gradient-to-b from-white/60 to-white/10" />
                </button>
                <span className="mt-1 h-2 w-5 rounded-full bg-white/20" />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-0.5 font-mono text-[9.5px] tracking-[0.1em] text-fog uppercase">
              <span className="truncate">
                {META[city.id].short} · <span className="num text-white/70">{clock(META[city.id].tz)}</span>
              </span>
              <span className="shrink-0">
                <b className="num text-white">{ev}</b> ev
                {gm ? (
                  <>
                    {' '}
                    · <b className="num text-white">{gm}</b> games
                  </>
                ) : null}
              </span>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button onClick={spin} disabled={spinning} className="btn-black flex-1 !rounded-xl !py-2 text-[12px]">
                🎰 {spinning ? 'Rolling…' : 'Spin'}
              </button>
              <button
                onClick={choose}
                disabled={spinning}
                className="flex-[1.4] rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] py-2 text-[12.5px] font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:opacity-50"
              >
                Fly in →
              </button>
            </div>
          </div>
        </div>
      )}
      {!open && !entered && splashDone && mapReady && (
        <button onClick={() => setOpen(true)} className="btn-black pointer-events-auto fixed bottom-[calc(var(--dock-h)+16px)] left-1/2 z-30 -translate-x-1/2 !rounded-2xl text-[13px]">
          🎰 Choose your city
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
