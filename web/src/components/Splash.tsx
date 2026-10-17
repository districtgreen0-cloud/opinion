import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import type { buildGlobe } from './splashGlobe'

const MIN_MS = 3600 // the intro always gets this long…
const MAX_MS = 10000 // …and never waits longer than this for the map
import { reduced } from './bits'

export default function Splash() {
  const done = useStore((s) => s.splashDone)
  const finish = useStore((s) => s.finishSplash)
  const ref = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem('opinion:splash') === '1'
      sessionStorage.setItem('opinion:splash', '1')
    } catch {
      /* storage blocked */
    }
    if (seen) {
      finish()
      return
    }
    const root = ref.current!
    let globe: ReturnType<typeof buildGlobe> | null = null
    let gone = false
    // three.js arrives in its own chunk: the title paints at once, the globe fades in when it lands
    if (!reduced())
      import('./splashGlobe')
        .then((m) => {
          if (gone || !canvas.current) return
          globe = m.buildGlobe(canvas.current)
          gsap.fromTo(canvas.current, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 2.2, ease: 'expo.out' })
        })
        .catch(() => {
          /* no WebGL / chunk failed → text-only intro */
        })
    const q = gsap.utils.selector(root)
    const intro = gsap.timeline()
    if (!reduced()) {
      intro
        .from(q('.sp-rings-wrap'), { opacity: 0, scale: 0.86, rotate: -25, transformOrigin: '50% 50%', duration: 2.4, ease: 'expo.out' }, 0.1)
        .from(q('.sp-l'), { yPercent: 110, opacity: 0, filter: 'blur(12px)', duration: 1, ease: 'expo.out', stagger: 0.07 }, 0.3)
        // the ON tumbles in and spins three full turns before landing
        .fromTo(q('.sp-n'), { rotationY: -1080, rotationX: 40, yPercent: 120, opacity: 0, transformPerspective: 900 }, { rotationY: 0, rotationX: 0, yPercent: 0, opacity: 1, duration: 1.8, ease: 'expo.out' }, 0.6)
        .from(q('.sp-tag span'), { yPercent: 100, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.05 }, 1.2)
        .from(q('.sp-meta'), { opacity: 0, y: 10, duration: 0.8, ease: 'expo.out', stagger: 0.1 }, 1.6)
    }
    // the bar fills over MIN_MS, then waits for the map tiles + 3D city
    const t0 = performance.now()
    gsap.to(bar.current, { scaleX: 0.86, duration: MIN_MS / 1000, ease: 'power2.out' })
    let exiting = false
    const exit = () => {
      if (exiting) return
      exiting = true
      clearInterval(poll)
      gsap
        .timeline({ onComplete: finish })
        .to(bar.current, { scaleX: 1, duration: 0.3, ease: 'power2.out' })
        .to(q('.sp-text'), { y: -40, opacity: 0, filter: 'blur(14px)', duration: 0.8, ease: 'power3.in' }, 0.15)
        .to(globe?.state ?? {}, { dive: 1, speed: 6, duration: 1.4, ease: 'power3.in' }, 0.15)
        .to(canvas.current, { opacity: 0, scale: 1.6, duration: 1.2, ease: 'power3.in' }, 0.35)
        .to(q('.sp-rings-wrap'), { opacity: 0, scale: 3.2, transformOrigin: '50% 50%', duration: 0.9, ease: 'power2.in' }, 0.2)
        .to(root, { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 1.0)
    }
    const poll = setInterval(() => {
      const el = performance.now() - t0
      if ((el > MIN_MS && useStore.getState().mapReady) || el > MAX_MS) exit()
    }, 150)
    root.addEventListener('click', exit)
    return () => {
      gone = true
      clearInterval(poll)
      intro.kill()
      globe?.dispose()
    }
  }, [finish])

  if (done) return null
  const tagline = 'Share your own, help world, make friends, get rewarded'
  return (
    <div ref={ref} className="force-dark fixed inset-0 z-50 overflow-hidden bg-black" role="presentation">
      {/* HUD compass rings: same as useopinion.io (Solana gradient) */}
      <div aria-hidden className="sp-rings-wrap pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="-500 -500 1000 1000" className="sp-rings absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <defs>
          <linearGradient id="spSolRing" gradientUnits="userSpaceOnUse" x1="-480" y1="-480" x2="480" y2="480">
            <stop offset="0" stopColor="#9945FF" />
            <stop offset=".5" stopColor="#7A6BFF" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <g className="ring r1"><circle r="330" /><circle r="330" className="ticks" /></g>
        <g className="ring r2"><circle r="392" className="dash" /><path d="M -392 0 A 392 392 0 0 1 -277 -277" className="arc" /><path d="M 392 0 A 392 392 0 0 1 277 277" className="arc" /></g>
        <g className="ring r4"><circle className="faint" r="420" />
          <line x1="0.0" y1="-404.0" x2="0.0" y2="-420.0" /><line x1="70.4" y1="-399.5" x2="71.8" y2="-407.3" /><line x1="138.8" y1="-381.2" x2="141.5" y2="-388.7" /><line x1="202.0" y1="-349.9" x2="210.0" y2="-363.7" /><line x1="260.8" y1="-310.8" x2="265.9" y2="-316.8" /><line x1="310.8" y1="-260.8" x2="316.8" y2="-265.9" /><line x1="349.9" y1="-202.0" x2="363.7" y2="-210.0" /><line x1="381.2" y1="-138.8" x2="388.7" y2="-141.5" /><line x1="399.5" y1="-70.4" x2="407.3" y2="-71.8" /><line x1="404.0" y1="-0.0" x2="420.0" y2="-0.0" /><line x1="399.5" y1="70.4" x2="407.3" y2="71.8" /><line x1="381.2" y1="138.8" x2="388.7" y2="141.5" /><line x1="349.9" y1="202.0" x2="363.7" y2="210.0" /><line x1="310.8" y1="260.8" x2="316.8" y2="265.9" /><line x1="260.8" y1="310.8" x2="265.9" y2="316.8" /><line x1="202.0" y1="349.9" x2="210.0" y2="363.7" /><line x1="138.8" y1="381.2" x2="141.5" y2="388.7" /><line x1="70.4" y1="399.5" x2="71.8" y2="407.3" /><line x1="0.0" y1="404.0" x2="0.0" y2="420.0" /><line x1="-70.4" y1="399.5" x2="-71.8" y2="407.3" /><line x1="-138.8" y1="381.2" x2="-141.5" y2="388.7" /><line x1="-202.0" y1="349.9" x2="-210.0" y2="363.7" /><line x1="-260.8" y1="310.8" x2="-265.9" y2="316.8" /><line x1="-310.8" y1="260.8" x2="-316.8" y2="265.9" /><line x1="-349.9" y1="202.0" x2="-363.7" y2="210.0" /><line x1="-381.2" y1="138.8" x2="-388.7" y2="141.5" /><line x1="-399.5" y1="70.4" x2="-407.3" y2="71.8" /><line x1="-404.0" y1="0.0" x2="-420.0" y2="0.0" /><line x1="-399.5" y1="-70.4" x2="-407.3" y2="-71.8" /><line x1="-381.2" y1="-138.8" x2="-388.7" y2="-141.5" /><line x1="-349.9" y1="-202.0" x2="-363.7" y2="-210.0" /><line x1="-310.8" y1="-260.8" x2="-316.8" y2="-265.9" /><line x1="-260.8" y1="-310.8" x2="-265.9" y2="-316.8" /><line x1="-202.0" y1="-349.9" x2="-210.0" y2="-363.7" /><line x1="-138.8" y1="-381.2" x2="-141.5" y2="-388.7" /><line x1="-70.4" y1="-399.5" x2="-71.8" y2="-407.3" />
          <text className="cl-card" x="0.0" y="-440.0" transform="rotate(0 0.0 -440.0)">N</text><text className="cl-deg" x="220.0" y="-381.1" transform="rotate(30 220.0 -381.1)">030</text><text className="cl-deg" x="381.1" y="-220.0" transform="rotate(60 381.1 -220.0)">060</text><text className="cl-card" x="440.0" y="-0.0" transform="rotate(90 440.0 -0.0)">E</text><text className="cl-deg" x="381.1" y="220.0" transform="rotate(120 381.1 220.0)">120</text><text className="cl-deg" x="220.0" y="381.1" transform="rotate(150 220.0 381.1)">150</text><text className="cl-card" x="0.0" y="440.0" transform="rotate(180 0.0 440.0)">S</text><text className="cl-deg" x="-220.0" y="381.1" transform="rotate(210 -220.0 381.1)">210</text><text className="cl-deg" x="-381.1" y="220.0" transform="rotate(240 -381.1 220.0)">240</text><text className="cl-card" x="-440.0" y="0.0" transform="rotate(270 -440.0 0.0)">W</text><text className="cl-deg" x="-381.1" y="-220.0" transform="rotate(300 -381.1 -220.0)">300</text><text className="cl-deg" x="-220.0" y="-381.1" transform="rotate(330 -220.0 -381.1)">330</text>
        </g>
        <g className="ring r3"><circle r="460" className="ticks fine" /><circle className="faint" r="472" /><path d="M 460 0 A 460 460 0 0 1 325 325" className="arc" /><path d="M -460 0 A 460 460 0 0 1 -325 -325" className="arc" /></g>
        <g><line x1="-490" y1="0" x2="-440" y2="0" /><line x1="440" y1="0" x2="490" y2="0" /><line x1="0" y1="-490" x2="0" y2="-440" /><line x1="0" y1="440" x2="0" y2="490" /></g>
      </svg>
      </div>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <div className="sp-text pointer-events-none relative flex h-full flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display flex justify-center text-[15vw] leading-[0.9] font-bold tracking-[-0.06em] text-white [text-shadow:0_0_50px_rgba(0,0,0,.9)] md:text-[150px]">
          {'OPINI'.split('').map((l, i) => (
            <span key={i} className="sp-l inline-block">
              {l}
            </span>
          ))}
          <span className="sp-n inline-block">ON</span>
        </h1>
        <p className="sp-tag mt-5 flex max-w-[640px] flex-wrap justify-center gap-x-[0.3em] overflow-hidden text-[18px] leading-snug font-medium text-white/90 [text-shadow:0_0_24px_#000] md:text-[26px]">
          {tagline.split(' ').map((w, i) => (
            <span key={i} className="inline-block">
              {w}
            </span>
          ))}
        </p>
        <div className="sp-meta mt-10 w-[220px]">
          <div className="h-px w-full overflow-hidden bg-white/10">
            <div ref={bar} className="h-full origin-left scale-x-0 bg-white" />
          </div>
          <div className="mt-2.5 font-mono text-[10px] tracking-[0.28em] text-white/45 uppercase">Loading the world</div>
        </div>
      </div>
    </div>
  )
}
