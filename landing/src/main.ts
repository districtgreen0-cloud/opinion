import Lenis from 'lenis'
import { gsap, ScrollTrigger, type SceneCtx } from './gsap'
import { Globe } from './globe'
import { preloader, heroIntro, ambient, stage } from './scenes/stage'
import { manifesto, how } from './scenes/story'
import { escrow } from './scenes/escrow'
import { stable, oracle, functions, connect, machines, cities, cta, scenes } from './scenes/world'
import { hud } from './scenes/hud'

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const desktop = matchMedia('(min-width: 900px)').matches
const html = document.documentElement
if (reduce) html.classList.add('reduced')

ScrollTrigger.config({ ignoreMobileResize: true })
// Pinned scenes are built for a top-down read; never restore a mid-pin scroll position.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
if (!location.hash) scrollTo(0, 0)
if (import.meta.env.DEV) Object.assign(window, { ST: ScrollTrigger, gsap })
hud()

// One WebGL globe for the hero; it only reads GSAP-tweened state.
const heroCanvas = document.querySelector<HTMLCanvasElement>('.globe-canvas')!
let globe: Globe | null = null
try {
  globe = new Globe(heroCanvas, { points: desktop ? 12000 : 5000, arcs: true, interactive: desktop && !reduce, dive: true, static: reduce })
} catch (e) {
  console.warn('WebGL unavailable; hero runs without the globe.', e)
}

// Smooth scroll drives ScrollTrigger.
let lenis: Lenis | null = null
if (!reduce) {
  lenis = new Lenis({ lerp: 0.1, anchors: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis!.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  lenis.stop()
}

const intro = preloader()

async function boot() {
  await document.fonts.ready

  const mm = gsap.matchMedia()
  mm.add(
    { desktop: '(min-width: 900px)', mobile: '(max-width: 899.98px)', motion: '(prefers-reduced-motion: no-preference)' },
    (ctx) => {
      const { desktop, motion } = ctx.conditions as { desktop: boolean; motion: boolean }
      if (!motion) return // reduced motion: static frames, instant colour, globe rendered once
      const c: SceneCtx = { desktop }
      // Created in page order so each pin measures against the spacers above it.
      stage(c, globe)
      manifesto(c)
      how(c)
      escrow(c)
      stable(c)
      oracle(c)
      functions(c)
      const offConnect = connect(c)
      machines(c)
      const offCities = cities(c)
      cta(c)
      scenes(c)
      return () => { offConnect?.(); offCities?.() }
    },
  )

  if (!reduce) ambient(globe)

  await intro
  lenis?.start()
  if (!reduce) heroIntro(globe)

  ScrollTrigger.refresh()
}

boot()
