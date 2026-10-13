import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { startTracking } from '../hooks/useGeolocation'
import { bearing as bearingTo, fetchRoute, fmtDist, fmtDur, MODE_LABEL, meters, pointAt, progress, type LngLat, type NavMode } from '../lib/route'
import { mapHandle } from '../map/Map3D'
import { reduced } from './bits'

const SIM_SPEED: Record<NavMode, number> = { foot: 1.4 * 6, bike: 4.5 * 5, car: 11 * 4 } // m/s, sped up for demos
const OFF_ROUTE_M = 45
const ARRIVE_M = 22

/** Turn-by-turn: next manoeuvre on top, distance / ETA / mode / end at the bottom. */
export default function NavHUD() {
  const nav = useStore((s) => s.nav)
  const pos = useStore((s) => s.pos)
  const acc = useStore((s) => s.geoAcc)
  const top = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const offCount = useRef(0)
  const lastRoute = useRef(0)
  const here: LngLat | null = pos ? [pos.lng, pos.lat] : null

  // (re)route when the destination or mode changes
  useEffect(() => {
    if (!nav || !here || nav.route?.mode === nav.mode) return
    const ac = new AbortController()
    setErr(null)
    useStore.getState().patchNav({ status: 'routing' })
    lastRoute.current = Date.now()
    fetchRoute(here, nav.dest, nav.mode, ac.signal)
      .then((route) => useStore.getState().patchNav({ route, status: 'active' }))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        setErr(e.message === 'no_route' ? 'No route found for this mode.' : 'Routing service unreachable. Check your connection.')
        useStore.getState().patchNav({ status: 'error' })
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav?.key, nav?.mode, nav?.route === null, !!here])

  const prog = useMemo(() => (nav?.route && here ? progress(nav.route, here) : null), [nav?.route, pos])
  const route = nav?.route ?? null
  const remaining = route && prog ? Math.max(0, route.distance - prog.along) : null
  const stepI = route && prog ? Math.max(0, route.steps.findIndex((s) => s.startAlong > prog.along + 3)) : 0
  const next = route ? (route.steps[stepI] ?? route.steps[route.steps.length - 1]) : null
  const toNext = next && prog ? Math.max(0, next.startAlong - prog.along) : null

  // off-route → reroute (debounced); arrival → finish
  useEffect(() => {
    if (!nav || !route || !prog || !here || nav.status !== 'active') return
    if (meters(here, nav.dest) < ARRIVE_M || (remaining !== null && remaining < ARRIVE_M)) {
      useStore.getState().toast(`You've arrived · ${nav.name}`, 'mint')
      useStore.getState().award(20, 'ride completed')
      useStore.getState().endNav()
      return
    }
    offCount.current = prog.off > OFF_ROUTE_M ? offCount.current + 1 : 0
    if (offCount.current >= 2 && Date.now() - lastRoute.current > 12_000) {
      offCount.current = 0
      useStore.getState().patchNav({ route: null })
      useStore.getState().toast('Rerouting…')
    }
  }, [prog, nav, route, here, remaining])

  // simulator: drives the dot along the route (demo / desktop)
  useEffect(() => {
    if (!nav?.simulate || !route) return
    let along = prog?.along ?? 0
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      along += (SIM_SPEED[route.mode] * (now - last)) / 1000
      last = now
      const [lng, lat] = pointAt(route, along)
      useStore.getState().setPos({ lat, lng, source: 'teleport' })
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav?.simulate, route])

  // follow camera: chase the dot, look 40 m ahead along the route
  useEffect(() => {
    const map = mapHandle.current
    if (!map || !nav?.follow || !here) return
    const ahead = route && prog ? pointAt(route, prog.along + 40) : nav.dest
    const b = meters(here, ahead) > 3 ? bearingTo(here, ahead) : map.getBearing()
    map.easeTo({ center: here, bearing: b, pitch: 62, zoom: Math.max(map.getZoom(), nav.mode === 'car' ? 16.6 : 17.4), duration: reduced() ? 0 : 900, easing: (t) => t })
  }, [pos, nav?.follow, route])

  // user grabs the map → stop following until Recenter
  useEffect(() => {
    const map = mapHandle.current
    if (!map || !nav) return
    const grab = (e: { originalEvent?: Event }) => e.originalEvent && useStore.getState().patchNav({ follow: false })
    map.on('dragstart', grab)
    map.on('rotatestart', grab)
    return () => {
      map.off('dragstart', grab)
      map.off('rotatestart', grab)
    }
  }, [!!nav])

  useEffect(() => {
    if (nav && top.current && !reduced()) gsap.fromTo(top.current, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' })
  }, [!!nav, next?.text])

  if (!nav) return null
  const s = useStore.getState()
  const eta = route && remaining !== null ? new Date(Date.now() + (route.duration * remaining) / Math.max(1, route.distance) * 1000) : null

  return (
    <>
      {/* next manoeuvre */}
      <div ref={top} className="pointer-events-auto absolute inset-x-2 top-[62px] z-30 mx-auto max-w-[460px] md:top-[76px]">
        <div className="glass-strong flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--panel-solid)' }}>
          {!here ? (
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-white">Where are you starting?</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => startTracking().then((ok) => !ok && s.toast('Location blocked · allow it in your browser settings', 'ember'))} className="btn-black !rounded-xl !px-3 !py-1.5 text-[12px]">
                  📍 Use my location
                </button>
                <button
                  onClick={() => {
                    const c = mapHandle.current?.getCenter()
                    if (c) s.setPos({ lat: c.lat, lng: c.lng, source: 'teleport' })
                  }}
                  className="btn-black !rounded-xl !px-3 !py-1.5 text-[12px]"
                >
                  From map centre · demo
                </button>
              </div>
            </div>
          ) : nav.status === 'routing' ? (
            <div className="flex-1 text-[14px] text-white">Finding the best {nav.mode === 'foot' ? 'walk' : nav.mode === 'bike' ? 'ride' : 'drive'}…</div>
          ) : nav.status === 'error' ? (
            <div className="flex-1 text-[13px] text-[#ff8a8a]">{err ?? 'Could not route.'}</div>
          ) : (
            <>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#9945ff] to-[#14f195] text-[26px] font-bold text-black">{next?.icon ?? '↑'}</div>
              <div className="min-w-0 flex-1">
                <div className="num text-[20px] leading-none font-bold text-white">{toNext !== null ? fmtDist(toNext) : ''}</div>
                <div className="mt-1 truncate text-[13px] text-white/80">{next?.text}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* trip bar */}
      <div className="pointer-events-auto absolute inset-x-2 bottom-[calc(var(--dock-h)+12px)] z-30 mx-auto max-w-[460px]">
        <div className="glass-strong rounded-2xl p-3" style={{ background: 'var(--panel-solid)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-white">→ {nav.name}</div>
              <div className="num mt-0.5 text-[12px] text-fog">
                {route && remaining !== null ? (
                  <>
                    <b className="text-white">{fmtDur((route.duration * remaining) / Math.max(1, route.distance))}</b> · {fmtDist(remaining)} · ETA {eta?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </>
                ) : (
                  '—'
                )}
                {pos?.source === 'gps' && acc ? <span className="ml-1 text-white/30">· ±{acc} m</span> : null}
              </div>
            </div>
            <button onClick={() => s.endNav()} className="shrink-0 rounded-xl border border-[#ff5a5a]/40 bg-[#ff5a5a]/15 px-3 py-1.5 text-[12.5px] font-medium text-[#ff8a8a]">
              End
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {(['foot', 'bike', 'car'] as NavMode[]).map((m) => (
              <button
                key={m}
                onClick={() => s.patchNav({ mode: m, route: null })}
                className={`flex-1 rounded-lg py-1.5 text-[11.5px] transition ${nav.mode === m ? 'bg-white/[.12] text-white ring-1 ring-white/20' : 'text-fog hover:text-white'}`}
                aria-pressed={nav.mode === m}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
            {!nav.follow && (
              <button onClick={() => s.patchNav({ follow: true })} className="btn-black !rounded-lg !px-2.5 !py-1.5 text-[11px]">
                ◎ Recenter
              </button>
            )}
            {route && (
              <button onClick={() => s.patchNav({ simulate: !nav.simulate, follow: true })} className={`btn-black !rounded-lg !px-2.5 !py-1.5 text-[11px] ${nav.simulate ? '!border-[#14f195]/60 !text-[#14f195]' : ''}`} title="Demo: ride the route without moving">
                {nav.simulate ? '■ Stop sim' : '▶ Simulate'}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[9px] text-white/25">Routes © OpenStreetMap contributors · OSRM. Watch the road, not the phone.</p>
        </div>
      </div>
    </>
  )
}

