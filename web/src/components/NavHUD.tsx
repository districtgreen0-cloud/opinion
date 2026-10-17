import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import * as maplibregl from 'maplibre-gl'
import { useStore } from '../store'
import { startTracking } from '../hooks/useGeolocation'
import { bearing as bearingTo, fetchRoute, fmtDist, fmtDur, kmh, mapLinks, meters, pointAt, progress, reversePlace, viaRoads, type LngLat, type NavMode } from '../lib/route'
import { mapHandle } from '../map/Map3D'
import { reduced } from './bits'

const SIM_SPEED: Record<NavMode, number> = { foot: 1.4 * 6, bike: 4.5 * 5, car: 11 * 4 } // m/s, sped up for demos
const OFF_ROUTE_M = 45
const ARRIVE_M = 22
const MODE_WORD: Record<NavMode, string> = { foot: 'walk', bike: 'ride', car: 'drive' }

/** Turn-by-turn like a maps app: next turn (+ the one after), road you're on, speed, ETA, full directions list. */
export default function NavHUD() {
  const nav = useStore((s) => s.nav)
  const pos = useStore((s) => s.pos)
  const acc = useStore((s) => s.geoAcc)
  const speed = useStore((s) => s.geoSpeed)
  const geoError = useStore((s) => s.geoError)
  const top = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [list, setList] = useState(false)
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
        setErr(e.message === 'no_route' ? `No ${MODE_WORD[nav.mode]} route found. Try another mode.` : 'Routing service unreachable. Check your connection.')
        useStore.getState().patchNav({ status: 'error' })
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav?.key, nav?.mode, nav?.route === null, !!here])

  // a dropped pin gets a real name (street / place) from reverse lookup
  useEffect(() => {
    if (!nav || nav.name !== 'Dropped pin') return
    let alive = true
    reversePlace(nav.dest).then((p) => alive && p && useStore.getState().patchNav({ name: p.name }))
    return () => {
      alive = false
    }
  }, [nav?.key, nav?.name])

  const prog = useMemo(() => (nav?.route && here ? progress(nav.route, here) : null), [nav?.route, pos])
  const route = nav?.route ?? null
  const remaining = route && prog ? Math.max(0, route.distance - prog.along) : null
  const stepI = route && prog ? Math.max(0, route.steps.findIndex((s) => s.startAlong > prog.along + 3)) : 0
  const next = route ? (route.steps[stepI] ?? route.steps[route.steps.length - 1]) : null
  const after = route ? route.steps[stepI + 1] : undefined
  const current = route ? route.steps[Math.max(0, stepI - 1)] : undefined // the step we're on = the road we're on
  const toNext = next && prog ? Math.max(0, next.startAlong - prog.along) : null
  const via = useMemo(() => (route ? viaRoads(route) : []), [route])

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
  const etaMs = route && remaining !== null ? (route.duration * remaining) / Math.max(1, route.distance) * 1000 : null
  const eta = etaMs !== null ? new Date(Date.now() + etaMs) : null
  const overview = () => {
    const map = mapHandle.current
    if (!map || !route) return
    s.patchNav({ follow: false })
    const b = route.coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(route.coords[0]!, route.coords[0]!))
    map.fitBounds(b, { padding: { top: 150, bottom: 260, left: 50, right: 50 }, pitch: 40, duration: 1200, maxZoom: 16.5 })
  }
  const links = mapLinks(nav.dest, nav.mode)

  return (
    <>
      {/* next manoeuvre */}
      <div ref={top} className="pointer-events-auto absolute inset-x-2 top-[62px] z-30 mx-auto max-w-[460px] md:top-[76px]">
        <div className="glass-strong rounded-2xl p-3" style={{ background: 'var(--panel-solid)' }}>
          {!here ? (
            <div>
              <div className="text-[14px] font-semibold text-white">Where are you starting?</div>
              {geoError && <p className="mt-1 text-[11.5px] leading-snug text-[#ff8a8a]">{geoError}</p>}
              <div className="mt-2 flex gap-2">
                <button onClick={() => startTracking()} className="btn-black !rounded-xl !px-3 !py-1.5 text-[12px]">
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
            <div className="text-[14px] text-white">Finding the best {MODE_WORD[nav.mode]}…</div>
          ) : nav.status === 'error' ? (
            <div className="text-[13px] text-[#ff8a8a]">{err ?? 'Could not route.'}</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#9945ff] to-[#14f195] text-[30px] font-bold text-black">{next?.icon ?? '↑'}</div>
                <div className="min-w-0 flex-1">
                  <div className="num text-[24px] leading-none font-bold text-white">{toNext !== null ? fmtDist(toNext) : ''}</div>
                  <div className="mt-1 truncate text-[14px] text-white/90">{next?.text}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] text-fog">
                <span className="truncate">{current?.name ? <>on <b className="text-white/80">{current.name}</b></> : after ? <>then {after.icon} {after.text}</> : ''}</span>
                {after && current?.name ? <span className="shrink-0 truncate">then {after.icon} {fmtDist(after.dist)}</span> : null}
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
                {route && remaining !== null && etaMs !== null ? (
                  <>
                    <b className="text-[#14f195]">{fmtDur(etaMs / 1000)}</b> · {fmtDist(remaining)} · arrive {eta?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </>
                ) : (
                  '—'
                )}
              </div>
              <div className="mt-0.5 truncate text-[10.5px] text-white/35">
                {via.length ? `via ${via.join(' · ')}` : ''}
                {speed !== null && speed > 0.5 ? ` · ${kmh(speed)}` : ''}
                {pos?.source === 'gps' && acc ? ` · ±${acc} m` : ''}
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
                {m === 'foot' ? '🚶' : m === 'bike' ? '🚲' : '🚗'}
              </button>
            ))}
            {route && (
              <button onClick={() => setList((v) => !v)} className={`btn-black !rounded-lg !px-2.5 !py-1.5 text-[11px] ${list ? '!border-white/40' : ''}`} aria-expanded={list}>
                ☰ Steps
              </button>
            )}
            {route && (
              <button onClick={overview} className="btn-black !rounded-lg !px-2.5 !py-1.5 text-[11px]" title="See the whole route">
                ⤢
              </button>
            )}
            {!nav.follow && (
              <button onClick={() => s.patchNav({ follow: true })} className="btn-black !rounded-lg !px-2.5 !py-1.5 text-[11px]">
                ◎
              </button>
            )}
            {route && (
              <button onClick={() => s.patchNav({ simulate: !nav.simulate, follow: true })} className={`btn-black !rounded-lg !px-2.5 !py-1.5 text-[11px] ${nav.simulate ? '!border-[#14f195]/60 !text-[#14f195]' : ''}`} title="Demo: ride the route without moving">
                {nav.simulate ? '■' : '▶'}
              </button>
            )}
          </div>
          {list && route && (
            <ol className="scroll-thin mt-2.5 max-h-[34vh] space-y-0.5 overflow-y-auto border-t border-white/10 pt-2">
              {route.steps.map((st, i) => (
                <li key={i} className={`flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-[12px] ${i === stepI ? 'bg-white/[.08] text-white' : i < stepI ? 'text-white/35' : 'text-white/75'}`}>
                  <span className="w-5 shrink-0 text-center text-[14px]">{st.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{st.text}</span>
                    {st.name && <span className="block truncate text-[10.5px] text-fog">{st.name}</span>}
                  </span>
                  <span className="num shrink-0 text-[11px] text-fog">{st.dist > 0 ? fmtDist(st.dist) : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 text-[9px] text-white/25">
            <span>© OpenStreetMap · OSRM · watch the road, not the phone</span>
            <span className="shrink-0">
              <a href={links.google} target="_blank" rel="noreferrer" className="hover:text-white">Google Maps ↗</a> · <a href={links.apple} target="_blank" rel="noreferrer" className="hover:text-white">Apple Maps ↗</a>
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
