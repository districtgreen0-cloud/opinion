import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { reduced } from './bits'

const TILT = 0.42
const SEG = 28

/** Small spinning wireframe globe in the brand gradient: back of the sphere dim, front bright, one orbiting node. */
export default function CyberGlobe({ size = 20, className = '' }: { size?: number; className?: string }) {
  const el = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = el.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    const dpr = Math.min(devicePixelRatio || 1, 3)
    c.width = c.height = size * dpr
    g.scale(dpr, dpr)
    const m = size / 2
    const R = m - 1.4
    const grad = g.createLinearGradient(0, 0, size, size)
    grad.addColorStop(0, '#9945ff')
    grad.addColorStop(0.5, '#4e8bc4')
    grad.addColorStop(1, '#14f195')

    // sphere point → screen, after spin around the axis and a fixed tilt towards the viewer
    const project = (lat: number, lng: number, spin: number): [number, number, number] => {
      const cl = Math.cos(lat)
      const x0 = cl * Math.sin(lng + spin), y0 = Math.sin(lat), z0 = cl * Math.cos(lng + spin)
      const y = y0 * Math.cos(TILT) - z0 * Math.sin(TILT)
      const z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT)
      return [m + x0 * R, m - y * R, z]
    }
    const curve = (at: (t: number) => [number, number], spin: number) => {
      // two passes: the far side first, faint, then the near side
      for (const front of [false, true]) {
        g.globalAlpha = front ? 1 : 0.22
        g.beginPath()
        let pen = false
        for (let i = 0; i <= SEG; i++) {
          const [la, ln] = at(i / SEG)
          const [x, y, z] = project(la, ln, spin)
          if (z >= 0 === front) {
            if (pen) g.lineTo(x, y)
            else g.moveTo(x, y)
            pen = true
          } else pen = false
        }
        g.stroke()
      }
      g.globalAlpha = 1
    }

    const draw = (spin: number) => {
      g.clearRect(0, 0, size, size)
      const glow = g.createRadialGradient(m, m, 0, m, m, R)
      glow.addColorStop(0, 'rgba(153,69,255,.28)')
      glow.addColorStop(1, 'rgba(20,241,149,.06)')
      g.fillStyle = glow
      g.beginPath()
      g.arc(m, m, R, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = grad
      g.lineWidth = Math.max(0.7, size / 32)
      g.lineCap = 'round'
      for (const lat of [-0.75, 0, 0.75]) curve((t) => [lat, t * Math.PI * 2], spin)
      for (let k = 0; k < 3; k++) curve((t) => [(t - 0.5) * Math.PI * 2, (k * Math.PI) / 3], spin)
      g.lineWidth = Math.max(1, size / 18)
      g.beginPath()
      g.arc(m, m, R, 0, Math.PI * 2)
      g.stroke()
      // a satellite node on the rim of an orbit
      const a = spin * 1.7
      const [nx, ny] = [m + Math.cos(a) * (R + 0.2), m + Math.sin(a) * (R + 0.2) * 0.55]
      g.fillStyle = '#14f195'
      g.shadowColor = '#14f195'
      g.shadowBlur = size / 4
      g.beginPath()
      g.arc(nx, ny, Math.max(1, size / 16), 0, Math.PI * 2)
      g.fill()
      g.shadowBlur = 0
    }

    if (reduced()) return draw(0.6)
    const tick = (t: number) => draw(t * 0.9)
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [size])

  return <canvas ref={el} className={`shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden />
}
