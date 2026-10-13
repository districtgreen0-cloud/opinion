import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { Observer } from 'gsap/Observer'
import { reduced } from './bits'

gsap.registerPlugin(Observer)

/**
 * OPINI + a spinning ON, one Solana-gradient unit that flips like a coin.
 * Any scroll in the app (wheel over the map, panel lists, touch drags) feeds angular
 * velocity into the N; it coasts like a coin, then settles face-forward on a full turn.
 */
export default function Logo({ size = 17, intro = false, className = '' }: { size?: number; intro?: boolean; className?: string }) {
  const nRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const n = nRef.current
    if (!n) return
    const still = reduced()
    gsap.set(n, { transformPerspective: 600, transformOrigin: '50% 55%' })

    if (intro && !still) {
      gsap.fromTo(n, { rotationY: -720, rotationX: 25, yPercent: 40, opacity: 0 }, { rotationY: 0, rotationX: 0, yPercent: 0, opacity: 1, duration: 2, ease: 'expo.out', delay: 0.55 })
    }
    if (still) return

    let angle = 0
    let vel = 0
    let settling: gsap.core.Tween | null = null
    const tilt = gsap.quickTo(n, 'rotationX', { duration: 0.5, ease: 'power3.out' })

    const tick = () => {
      if (Math.abs(vel) < 0.15) {
        if (vel !== 0) {
          vel = 0
          // land on the nearest full face
          const target = Math.round(angle / 360) * 360
          settling = gsap.to(n, {
            rotationY: target,
            duration: 0.9,
            ease: 'elastic.out(1, 0.55)',
            onUpdate: () => {
              angle = gsap.getProperty(n, 'rotationY') as number
            },
          })
          tilt(0)
        }
        return
      }
      angle += vel
      vel *= 0.94 // coin friction
      gsap.set(n, { rotationY: angle })
    }
    gsap.ticker.add(tick)

    const kick = (dy: number) => {
      settling?.kill()
      vel = gsap.utils.clamp(-38, 38, vel + dy * 0.18)
      tilt(gsap.utils.clamp(-22, 22, -dy * 0.25))
    }
    const obs = Observer.create({
      target: window,
      type: 'wheel,touch',
      onChange: (self) => kick(self.deltaY || self.deltaX),
    })
    // scrolling inside panels/lists doesn't bubble as wheel on touch — listen in capture phase
    const onScroll = () => kick(14)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })

    return () => {
      gsap.ticker.remove(tick)
      obs.kill()
      settling?.kill()
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [intro])

  const spinOnce = () => {
    if (!nRef.current || reduced()) return
    const cur = gsap.getProperty(nRef.current, 'rotationY') as number
    gsap.to(nRef.current, { rotationY: Math.round(cur / 360) * 360 + 360, duration: 1.1, ease: 'expo.out' })
  }

  return (
    <span
      className={`font-display inline-flex items-baseline font-bold tracking-[-0.04em] text-white ${className}`}
      style={{ fontSize: size, perspective: 600 }}
      onClick={spinOnce}
      aria-label="OPINION"
      role="img"
    >
      <span aria-hidden>OPINI</span>
      <span ref={nRef} aria-hidden className="logo-n sol-n inline-block" style={{ willChange: 'transform' }}>
        ON
      </span>
    </span>
  )
}
