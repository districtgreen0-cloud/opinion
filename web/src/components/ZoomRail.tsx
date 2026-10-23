import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { mapHandle } from '../map/handle'
import { reduced } from './bits'

const PX_PER_ZOOM = 56 // tape speed: one zoom level = 56px of ruler
const MIN_Z = 0
const MAX_Z = 20

/** Left-edge zoom tape + compass: ticks slide as you zoom, click softly, drag/scroll to zoom, tap needle for north. */
export default function ZoomRail() {
  const ready = useStore((s) => s.mapReady)
  const ui = useStore((s) => s.ui) // redraw the tape in the new ink when the theme flips
  const hidden = useStore((s) => s.tab !== 'explore' || !!s.selectedCell || s.pickerOpen)
  // mobile: the events / sports strips sit above the dock — end the tape above them
  const strip = useStore((s) => s.tab === 'explore' && !s.selectedCell && s.entered && (s.homeFilter === 'event' || s.homeFilter === 'sport'))
  const canvas = useRef<HTMLCanvasElement>(null)
  const needle = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = mapHandle.current
    const cv = canvas.current
    if (!ready || !map || !cv) return
    const g = cv.getContext('2d')!
    let raf = 0
    let lastQ = Math.floor(map.getZoom() * 4)
    const draw = () => {
      raf = 0
      const dpr = Math.min(devicePixelRatio || 1, 3)
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--rail-ink').trim() || '255,255,255'
      const z = map.getZoom()
      const mid = h / 2
      // ticks every 0.25 zoom; zoom grows upward (like pushing in)
      const first = Math.floor((z - mid / PX_PER_ZOOM) * 4) - 1
      const last = Math.ceil((z + mid / PX_PER_ZOOM) * 4) + 1
      for (let q = first; q <= last; q++) {
        const tz = q / 4
        if (tz < MIN_Z || tz > MAX_Z) continue
        const y = mid - (tz - z) * PX_PER_ZOOM
        const edge = Math.min(y, h - y) / (h * 0.42) // fade toward the ends
        const a = Math.max(0, Math.min(1, edge))
        const major = q % 4 === 0
        const half = q % 2 === 0
        const near = Math.max(0, 1 - Math.abs(y - mid) / 60) // ticks swell near the needle
        const len = (major ? 9 : half ? 5.5 : 3.5) + near * 3.5
        g.strokeStyle = `rgba(${ink},${(major ? 0.85 : 0.38) * a})`
        g.lineWidth = major ? 1.4 : 1
        g.beginPath()
        g.moveTo(w - 2 - len, Math.round(y) + 0.5)
        g.lineTo(w - 2, Math.round(y) + 0.5)
        g.stroke()
        if (major && a > 0.15 && Math.abs(y - mid) > 16) {
          g.fillStyle = `rgba(${ink},${0.55 * a})`
          g.font = '600 7px "Geist Mono", ui-monospace, monospace'
          g.textAlign = 'right'
          g.textBaseline = 'middle'
          g.fillText(String(tz), w - 2 - len - 3, y)
        }
      }
      // spine
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, `rgba(${ink},0)`)
      grad.addColorStop(0.5, `rgba(${ink},.28)`)
      grad.addColorStop(1, `rgba(${ink},0)`)
      g.fillStyle = grad
      g.fillRect(w - 1.5, 0, 1, h)
      if (readout.current) readout.current.textContent = z.toFixed(1)
      if (needle.current) needle.current.style.transform = `rotate(${-map.getBearing()}deg)`
      // a click for every quarter-zoom detent crossed
      const q = Math.floor(z * 4)
      if (q !== lastQ) {
        lastQ = q
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    map.on('move', schedule)
    map.on('resize', schedule)
    addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', schedule)
      map.off('resize', schedule)
      removeEventListener('resize', schedule)
    }
  }, [ready, ui])

  // entrance
  useEffect(() => {
    if (!ready || !root.current || reduced()) return
    gsap.fromTo(root.current, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, ease: 'expo.out', delay: 0.4 })
  }, [ready])

  // drag the tape: up = zoom in
  const drag = useRef<{ y: number; z: number; t: number; lastY: number; v: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    const map = mapHandle.current
    if (!map) return
    map.stop()
    drag.current = { y: e.clientY, z: map.getZoom(), t: performance.now(), lastY: e.clientY, v: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const map = mapHandle.current
    if (!d || !map) return
    const now = performance.now()
    d.v = (d.lastY - e.clientY) / Math.max(1, now - d.t) // px/ms, up positive
    d.t = now
    d.lastY = e.clientY
    map.jumpTo({ zoom: Math.min(MAX_Z, Math.max(MIN_Z, d.z + (d.y - e.clientY) / PX_PER_ZOOM)) })
  }
  const onUp = () => {
    const d = drag.current
    const map = mapHandle.current
    drag.current = null
    if (!d || !map) return
    const v = performance.now() - d.t > 90 ? 0 : d.v
    if (Math.abs(v) > 0.05) map.easeTo({ zoom: Math.min(MAX_Z, Math.max(MIN_Z, map.getZoom() + (v * 220) / PX_PER_ZOOM)), duration: 700, easing: (t) => 1 - (1 - t) ** 3 })
  }
  const onWheel = (e: React.WheelEvent) => {
    const map = mapHandle.current
    if (!map) return
    map.easeTo({ zoom: Math.min(MAX_Z, Math.max(MIN_Z, map.getZoom() - e.deltaY / 240)), duration: 220 })
  }
  const step = (d: number) => mapHandle.current?.easeTo({ zoom: (mapHandle.current.getZoom() ?? 0) + d, duration: 600 })
  const north = () => mapHandle.current?.easeTo({ bearing: 0, duration: 900 })

  if (!ready) return null
  return (
    <div
      ref={root}
      className={`pointer-events-none absolute top-[110px] ${strip ? 'bottom-[calc(var(--dock-h)+150px)] lg:bottom-[calc(var(--dock-h)+14px)]' : 'bottom-[calc(var(--dock-h)+14px)]'} left-1 z-[15] flex w-[24px] flex-col items-center transition-opacity duration-300 md:top-[128px] md:left-2.5 ${hidden ? 'pointer-events-none !opacity-0 [&_*]:!pointer-events-none' : 'opacity-100'}`}
      aria-hidden={hidden}
    >
      {/* compass */}
      <button
        onClick={north}
        className="glass-strong pointer-events-auto relative grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full"
        aria-label="Reset map to north"
        title="Tap: face north"
      >
        <div ref={needle} className="relative h-[17px] w-[17px] will-change-transform">
          <span className="absolute top-0 left-1/2 h-[8.5px] w-[2.5px] -translate-x-1/2 rounded-full bg-white [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
          <span className="absolute bottom-0 left-1/2 h-[8.5px] w-[2.5px] -translate-x-1/2 rounded-full bg-white/30 [clip-path:polygon(0_0,100%_0,50%_100%)]" />
          <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 font-mono text-[5.5px] font-bold text-white/70">N</span>
        </div>
      </button>
      <button onClick={() => step(1)} className="pointer-events-auto mt-1 grid h-5 w-5 shrink-0 place-items-center text-[12px] leading-none text-white/55 hover:text-white" aria-label="Zoom in">
        +
      </button>

      {/* the tape */}
      <div
        className="pointer-events-auto relative my-1 w-full flex-1 cursor-ns-resize touch-none rounded-full bg-gradient-to-r from-black/0 via-black/35 to-black/55 backdrop-blur-[2px] [mask-image:linear-gradient(transparent,#000_12%,#000_88%,transparent)]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        role="slider"
        aria-label="Map zoom"
        aria-valuemin={MIN_Z}
        aria-valuemax={MAX_Z}
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'ArrowUp' ? step(0.5) : e.key === 'ArrowDown' ? step(-0.5) : null)}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {/* needle: fixed at the middle while the tape slides */}
        <div className="pointer-events-none absolute top-1/2 right-0 left-0 -translate-y-1/2">
          <div className="absolute right-0 h-px w-[16px] bg-gradient-to-l from-white to-transparent shadow-[0_0_8px_rgba(255,255,255,.8)]" />
          <span className="absolute right-[1px] -translate-y-1/2 border-y-[3px] border-r-[5px] border-y-transparent border-r-white" />
          <span ref={readout} className="num absolute top-[6px] right-0 rounded bg-black/70 px-[2px] font-mono text-[7.5px] font-semibold text-white">
            0.0
          </span>
        </div>
      </div>

      <button onClick={() => step(-1)} className="pointer-events-auto mb-1 grid h-5 w-5 shrink-0 place-items-center text-[13px] leading-none text-white/55 hover:text-white" aria-label="Zoom out">
        −
      </button>
    </div>
  )
}
