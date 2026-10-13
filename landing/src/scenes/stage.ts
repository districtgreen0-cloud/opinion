import { gsap, SplitText, SCRAMBLE, type SceneCtx } from '../gsap'
import { hex } from '../fx'
import type { Globe } from '../globe'

/** Preloader: counter 000 → 100 with a line; the line splits and wipes up. Skipped on repeat visits. */
export function preloader(): Promise<void> {
  const el = document.querySelector<HTMLElement>('.preloader')
  if (!el || document.documentElement.classList.contains('seen') || getComputedStyle(el).display === 'none') return Promise.resolve()
  try { sessionStorage.setItem('op-seen', '1') } catch { /* private mode */ }
  const count = el.querySelector('.pl-count')!
  const line = el.querySelector('.pl-line i')!
  const n = { v: 0 }
  return new Promise((done) => {
    gsap.timeline({ onComplete: () => { el.remove(); done() } })
      .to(n, { v: 100, duration: 1.15, ease: 'hud', onUpdate: () => { count.textContent = String(Math.round(n.v)).padStart(3, '0') } })
      .to(line, { scaleX: 1, duration: 1.15, ease: 'hud' }, 0)
      .to(['.pl-count', '.pl-cap'], { opacity: 0, y: -10, duration: 0.25, stagger: 0.04 }, '>-0.05')
      .to(line, { scaleX: 0, transformOrigin: 'center', duration: 0.3, ease: 'power2.in' }, '<')
      .to(el, { clipPath: 'inset(0 0 100% 0)', duration: 0.6, ease: 'expo.inOut' }, '>-0.1')
  })
}

/** Hero intro: wordmark chars rise from a mask with blur; "ON" spins three turns. */
export function heroIntro(globe: Globe | null) {
  const a = SplitText.create('.wm-a', { type: 'chars', mask: 'chars' })
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
  tl.from(a.chars, { yPercent: 115, filter: 'blur(14px)', duration: 1.5, stagger: 0.055 })
    .fromTo('.wm-on', { rotationY: -1080, opacity: 0, scale: 0.7 }, { rotationY: 0, opacity: 1, scale: 1, duration: 2.6 }, 0.18)
    .from('.hero-line', { opacity: 0, y: 18, duration: 1.2 }, 0.7)
    .from('.hero-kicker', { duration: 1.2, scrambleText: { text: '{original}', chars: SCRAMBLE, speed: 0.6 } }, 0.4)
    .from('.hero-sub', { opacity: 0, duration: 1 }, 1.1)
    .fromTo('.hud-rings .draw', { drawSVG: 0 }, { drawSVG: '100%', duration: 2.4, stagger: { each: 0.012, from: 'random' }, ease: 'power3.inOut' }, 0)
    .from('.hud-rings .ticks, .hud-rings .dash, .hud-rings text', { opacity: 0, duration: 1.4, stagger: 0.02 }, 0.6)
    .from('.hud-coords span', { opacity: 0, duration: 0.8, stagger: 0.08 }, 0.8)
    .from('.hud', { yPercent: 100, duration: 1.2, ease: 'hud' }, 0.6)
    .from('.scroll-cue', { opacity: 0, duration: 1 }, 1.4)
  if (globe) tl.from(globe.state, { spin: -2.4, duration: 3.2, ease: 'expo.out' }, 0)
  return tl
}

/** Ambient ring spins + arc loop (outside scroll). */
export function ambient(globe: Globe | null) {
  gsap.to('.hud-rings .r1', { rotation: 360, svgOrigin: '0 0', duration: 90, repeat: -1, ease: 'none' })
  gsap.to('.hud-rings .r2', { rotation: -360, svgOrigin: '0 0', duration: 140, repeat: -1, ease: 'none' })
  gsap.to('.hud-rings .r3', { rotation: 360, svgOrigin: '0 0', duration: 220, repeat: -1, ease: 'none' })
  gsap.to('.hud-rings .r4', { rotation: -360, svgOrigin: '0 0', duration: 300, repeat: -1, ease: 'none' })
  if (globe) gsap.fromTo(globe.state, { arcs: 0 }, { arcs: 1, duration: 9, repeat: -1, ease: 'none', repeatDelay: 0.6 })
}

/** Fill the dive target with an H3-style hex field (pointy-top), each hex tagged with its ring distance. */
function buildHexField(svg: SVGSVGElement) {
  const NS = 'http://www.w3.org/2000/svg'
  svg.replaceChildren()
  const R = 54, W = Math.sqrt(3) * R, cx = 800, cy = 500
  const pts = (x: number, y: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}` }).join(' ')
  let maxD = 0
  for (let r = -8; r <= 8; r++) for (let q = -14; q <= 14; q++) {
    const x = cx + W * (q + r / 2), y = cy + 1.5 * R * r
    if (x < -R || x > 1600 + R || y < -R || y > 1000 + R) continue
    const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
    maxD = Math.max(maxD, d)
    const p = document.createElementNS(NS, 'polygon')
    p.setAttribute('points', pts(x, y, R - 3))
    p.setAttribute('class', d === 0 ? 'hx me' : 'hx')
    p.dataset.d = String(d)
    svg.appendChild(p)
  }
  const ring = document.createElementNS(NS, 'polygon')
  ring.setAttribute('points', pts(cx, cy, R - 3)); ring.setAttribute('class', 'me-ring')
  // Detail inside your hex: inner dashed hex + spokes.
  const inner = document.createElementNS(NS, 'polygon')
  inner.setAttribute('points', pts(cx, cy, (R - 3) * 0.58)); inner.setAttribute('class', 'me-in')
  svg.append(inner)
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const l = document.createElementNS(NS, 'line')
    l.setAttribute('x1', String(cx + 12 * Math.cos(a))); l.setAttribute('y1', String(cy + 12 * Math.sin(a)))
    l.setAttribute('x2', String(cx + (R - 3) * 0.58 * Math.cos(a))); l.setAttribute('y2', String(cy + (R - 3) * 0.58 * Math.sin(a)))
    l.setAttribute('class', 'me-spoke')
    svg.append(l)
  }
  const dot = document.createElementNS(NS, 'circle')
  dot.setAttribute('cx', String(cx)); dot.setAttribute('cy', String(cy)); dot.setAttribute('r', '7'); dot.setAttribute('class', 'me-dot')
  svg.append(ring, dot)
  return maxD
}

/**
 * Stage scene: ONE pinned timeline owns the wordmark, the rings, the globe dive and the hex iris
 * that opens onto the hex you are standing in.
 */
export function stage(_ctx: SceneCtx, globe: Globe | null) {
  const target = document.querySelector<HTMLElement>('.dive-hex')!
  const svg = target.querySelector<SVGSVGElement>('.hexfield')!
  const maxD = buildHexField(svg)
  const iris = { r: 0 }
  const setIris = () => { target.style.clipPath = hex(target.offsetWidth, target.offsetHeight, iris.r) }
  const line = SplitText.create('.dh-line', { type: 'words,chars', mask: 'chars' })

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '.stage', start: 'top top', end: '+=280%', pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true, onRefresh: setIris },
  })
  tl.to('.hero-copy', { scale: 1.4, opacity: 0, filter: 'blur(10px)', duration: 0.28, ease: 'power2.in' }, 0)
    .to('.scroll-cue', { opacity: 0, duration: 0.06 }, 0)
    .to('.hud-coords', { opacity: 0, duration: 0.18 }, 0.04)
    .to('.hud-rings', { scale: 3.2, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0)
    // The compass spins as you scroll: each ring its own way.
    .to('.hud-rings .s1', { rotation: 160, svgOrigin: '0 0', duration: 0.5 }, 0)
    .to('.hud-rings .s2', { rotation: -220, svgOrigin: '0 0', duration: 0.5 }, 0)
    .to('.hud-rings .s3', { rotation: 110, svgOrigin: '0 0', duration: 0.5 }, 0)
    .to('.hud-rings .s4', { rotation: -140, svgOrigin: '0 0', duration: 0.5 }, 0)
  if (globe) tl.to(globe.state, { dive: 1, duration: 0.72, ease: 'power3.inOut' }, 0.04)
  tl.set(target, { visibility: 'visible' }, 0.6)
    .fromTo(iris, { r: 0 }, { r: 1, duration: 0.3, ease: 'power2.in', onUpdate: setIris }, 0.6)
    .fromTo(svg, { scale: 1.8, rotation: -8 }, { scale: 1, rotation: 0, transformOrigin: '50% 50%', duration: 0.42, ease: 'power3.out' }, 0.6)
  // Hexes ripple in, ring by ring, from the one you stand in.
  for (let d = 0; d <= maxD; d++) {
    tl.fromTo(svg.querySelectorAll(`.hx[data-d="${d}"]`), { opacity: 0 }, { opacity: 1, duration: 0.06 }, 0.64 + d * 0.016)
  }
  tl.fromTo('.hx.me', { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.05 }, 0.8)
    .fromTo('.me-in, .me-spoke', { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.82)
    .fromTo('.me-dot', { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.04, ease: 'back.out(3)' }, 0.84)
    .fromTo('.me-ring', { scale: 1, opacity: 1, transformOrigin: '50% 50%' }, { scale: 3, opacity: 0, duration: 0.12, ease: 'power2.out' }, 0.84)
    .from(line.chars, { yPercent: 115, stagger: 0.003, duration: 0.08, ease: 'power3.out' }, 0.86)
    .from('.dh-tag', { opacity: 0, duration: 0.04 }, 0.88)
    .to('.dh-tag', { duration: 0.08, scrambleText: { text: '{original}', chars: SCRAMBLE } }, 0.88)
    .to({}, { duration: 0.12 })
  setIris()
  return tl
}
