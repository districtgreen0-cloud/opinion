import { gsap, ScrollTrigger, SplitText, SCRAMBLE, type SceneCtx } from '../gsap'
import { Globe } from '../globe'

const reveal = (targets: gsap.TweenTarget, trigger: Element | string, vars: gsap.TweenVars = {}) =>
  gsap.from(targets, { y: 40, opacity: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out', ...vars, scrollTrigger: { trigger, start: 'top 80%', toggleActions: 'play none none reverse' } })

const scrambleIn = (el: Element | string, trigger: Element | string = el as Element) =>
  gsap.from(el, { duration: 1.2, scrambleText: { text: '{original}', chars: SCRAMBLE, speed: 0.5 }, scrollTrigger: { trigger, start: 'top 85%' } })

/** Stablecoins: outlined marquee scrubbed sideways, masked line reveal, the value loop drawn on scroll. */
export function stable({ desktop }: SceneCtx) {
  gsap.fromTo('.sm-track', { xPercent: 0 }, { xPercent: -50, ease: 'none', scrollTrigger: { trigger: '.stable', start: 'top bottom', end: 'bottom top', scrub: 0.6 } })
  const h = SplitText.create('.stable-h', { type: 'lines', mask: 'lines' })
  gsap.from(h.lines, { yPercent: 110, duration: 1.3, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.stable-h', start: 'top 82%', toggleActions: 'play none none reverse' } })
  scrambleIn('.stable .kicker')
  reveal('.stable-copy p:not(.kicker), .stable-list li', '.stable-copy p:not(.kicker)')
  // Line-drawn coin: rings draw in, the $ lands, ticks keep turning, the arc tracks scroll.
  gsap.timeline({ scrollTrigger: { trigger: '.coin-art', start: 'top 80%', toggleActions: 'play none none reverse' } })
    .from('.coin-art .ca-ring', { drawSVG: 0, duration: 1.6, stagger: 0.15, ease: 'expo.out' })
    .from('.coin-art .ca-sign', { scale: 0.4, opacity: 0, transformOrigin: '50% 50%', duration: 1.2, ease: 'expo.out' }, 0.3)
    .from('.coin-art .ca-cap', { opacity: 0, duration: 0.8 }, 0.7)
  gsap.to('.coin-art .ca-ticks', { rotation: 360, svgOrigin: '0 0', duration: 60, repeat: -1, ease: 'none' })
  gsap.fromTo('.coin-art .ca-arc', { rotation: 0, svgOrigin: '0 0' }, { rotation: 540, svgOrigin: '0 0', ease: 'none', scrollTrigger: { trigger: '.stable', start: 'top bottom', end: 'bottom top', scrub: 1 } })

  // Value loop: arc draws, a dot travels it, each station lights up as the dot passes.
  const items = gsap.utils.toArray<HTMLElement>('.loop-steps li')
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: desktop
      ? { trigger: '.loop', start: 'center center', end: '+=160%', pin: '.loop', scrub: 1, anticipatePin: 1 }
      : { trigger: '.loop', start: 'top 70%', end: 'bottom 40%', scrub: 1 },
  })
  tl.fromTo('.lp-arc', { drawSVG: 0 }, { drawSVG: '100%', duration: 1 }, 0)
    .to('.lp-dot', { motionPath: { path: '.lp-arc', align: '.lp-arc', alignOrigin: [0.5, 0.5] }, duration: 1 }, 0)
    .fromTo('.lp-ticks', { rotation: 0, svgOrigin: '0 0' }, { rotation: 72, svgOrigin: '0 0', duration: 1 }, 0)
  items.forEach((li, i) => tl.fromTo(li, { opacity: 0.18 }, { opacity: 1, duration: 0.08 }, i / items.length + 0.01))
  const words = SplitText.create('.loop-h', { type: 'words' })
  tl.fromTo(words.words, { opacity: 0.12 }, { opacity: 1, stagger: 0.05, duration: 0.15 }, 0.75)
}

/** Oracle: pipeline drawn on scroll, labels scramble in, JSON record types in and flickers. */
export function oracle(_ctx: SceneCtx) {
  scrambleIn('.oracle .kicker')
  const h = SplitText.create('.oracle-head:not(.sensors-head) h2', { type: 'lines', mask: 'lines' })
  gsap.from(h.lines, { yPercent: 110, duration: 1.2, stagger: 0.12, ease: 'expo.out', scrollTrigger: { trigger: '.oracle-head:not(.sensors-head)', start: 'top 80%', toggleActions: 'play none none reverse' } })
  reveal('.oracle-head:not(.sensors-head) p', '.oracle-head:not(.sensors-head)')

  gsap.fromTo('.pp', { drawSVG: 0 }, { drawSVG: '100%', ease: 'none', stagger: 0.3, scrollTrigger: { trigger: '.pipe', start: 'top 75%', end: 'bottom 60%', scrub: 1 } })
  gsap.utils.toArray<HTMLElement>('.pipe-steps li').forEach((li, i) => {
    gsap.from(li, {
      opacity: 0, scale: 0.85, duration: 0.9, ease: 'expo.out',
      scrambleText: { text: li.dataset.text ?? li.textContent ?? '', chars: SCRAMBLE, speed: 0.6 },
      scrollTrigger: { trigger: li, start: 'top 82%', toggleActions: 'play none none reverse' }, delay: i * 0.04,
    })
  })

  const jl = gsap.utils.toArray<HTMLElement>('.json .jl')
  const vals = gsap.utils.toArray<HTMLElement>('.json i')
  gsap.timeline({ scrollTrigger: { trigger: '.record', start: 'top 78%', toggleActions: 'play none none reverse' } })
    .from('.record', { clipPath: 'inset(0 100% 0 0)', duration: 1, ease: 'expo.inOut' })
    .from(jl, { opacity: 0, x: -14, stagger: 0.06, duration: 0.4, ease: 'power2.out' }, 0.4)
    .fromTo(vals, { opacity: 1 }, { opacity: 0.15, duration: 0.06, repeat: 3, yoyo: true, stagger: 0.03, ease: 'steps(1)' }, '>-0.2')
    .from('.consumers', { opacity: 0, duration: 0.8 }, '<')

  // Sensor roadmap
  scrambleIn('.sensors-head .kicker')
  const sh = SplitText.create('.sensors-head h2', { type: 'lines', mask: 'lines' })
  gsap.from(sh.lines, { yPercent: 110, duration: 1.2, stagger: 0.12, ease: 'expo.out', scrollTrigger: { trigger: '.sensors-head', start: 'top 80%', toggleActions: 'play none none reverse' } })
  reveal('.sensors-head p:not(.kicker)', '.sensors-head')
  reveal('.sensors li', '.sensors', { stagger: 0.06 })
}

/** Functions: batch stagger, index scrambles on hover. */
export function functions(_ctx: SceneCtx) {
  scrambleIn('.functions .kicker')
  const h = SplitText.create('.fn-head h2', { type: 'lines', mask: 'lines' })
  gsap.from(h.lines, { yPercent: 110, duration: 1.2, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.fn-head', start: 'top 80%', toggleActions: 'play none none reverse' } })

  gsap.set('.fn', { opacity: 0, y: 60 })
  ScrollTrigger.batch('.fn', {
    start: 'top 88%',
    onEnter: (b) => gsap.to(b, { opacity: 1, y: 0, stagger: 0.08, duration: 1, ease: 'expo.out', overwrite: true }),
    onLeaveBack: (b) => gsap.to(b, { opacity: 0, y: 60, stagger: 0.04, duration: 0.5, overwrite: true }),
  })
  document.querySelectorAll<HTMLElement>('.fn').forEach((card) => {
    const i = card.querySelector<HTMLElement>('.fn-i')!
    card.addEventListener('pointerenter', () => gsap.to(i, { duration: 0.5, overwrite: true, scrambleText: { text: i.textContent!, chars: '0123456789/F', speed: 1 } }))
  })
}

/** Connect: a crowd graph assembles on hexes and tilts toward the cursor on desktop. */
export function connect({ desktop }: SceneCtx) {
  scrambleIn('.connect .kicker')
  const h = SplitText.create('.connect h2', { type: 'lines', mask: 'lines' })
  gsap.from(h.lines, { yPercent: 110, duration: 1.2, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.connect', start: 'top 70%', toggleActions: 'play none none reverse' } })
  reveal('.connect-copy p:not(.kicker)', '.connect-copy')

  const svg = document.querySelector<SVGSVGElement>('.crowd')!
  buildCrowd(svg)
  gsap.timeline({ scrollTrigger: { trigger: svg, start: 'top 80%', end: 'center 45%', scrub: 1 } })
    .from(svg.querySelectorAll('.cg-hex'), { opacity: 0, duration: 0.3, stagger: { each: 0.004, from: 'center' } }, 0)
    .from(svg.querySelectorAll('.cg-node'), { scale: 0, transformOrigin: '50% 50%', duration: 0.2, stagger: 0.02, ease: 'back.out(3)' }, 0.1)
    .from(svg.querySelectorAll('.cg-edge'), { drawSVG: 0, duration: 0.4, stagger: 0.015 }, 0.3)
    .from(svg.querySelectorAll('.cg-label'), { opacity: 0, duration: 0.2, stagger: 0.05 }, 0.7)
  gsap.to(svg.querySelectorAll('.cg-node.hub'), { scale: 1.35, transformOrigin: '50% 50%', duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.4 })
  if (desktop) {
    const rx = gsap.quickTo(svg, 'rotationX', { duration: 1, ease: 'power3' })
    const ry = gsap.quickTo(svg, 'rotationY', { duration: 1, ease: 'power3' })
    gsap.set(svg, { transformPerspective: 900 })
    const zone = document.querySelector<HTMLElement>('.connect')!
    const move = (e: PointerEvent) => { ry((e.clientX / innerWidth - 0.5) * 18); rx(-(e.clientY / innerHeight - 0.5) * 12) }
    zone.addEventListener('pointermove', move)
    return () => zone.removeEventListener('pointermove', move)
  }
}

/** People as nodes on hexes; each links to its two nearest neighbours; three hubs carry a label. */
function buildCrowd(svg: SVGSVGElement) {
  const NS = 'http://www.w3.org/2000/svg'
  svg.replaceChildren()
  const R = 30, W = Math.sqrt(3) * R
  const cells: [number, number][] = []
  for (let r = -7; r <= 7; r++) for (let q = -9; q <= 9; q++) {
    const x = 300 + W * (q + r / 2), y = 300 + 1.5 * R * r
    if (Math.hypot(x - 300, y - 300) > 270) continue
    cells.push([x, y])
    const p = document.createElementNS(NS, 'polygon')
    p.setAttribute('points', Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${(x + (R - 2) * Math.cos(a)).toFixed(1)},${(y + (R - 2) * Math.sin(a)).toFixed(1)}` }).join(' '))
    p.setAttribute('class', 'cg-hex')
    svg.appendChild(p)
  }
  // Deterministic pick so the graph looks the same on every visit.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const nodes = cells.filter(([x, y]) => Math.hypot(x - 300, y - 300) < 240).sort(() => rnd() - 0.5).slice(0, 22)
  const edges = new Set<string>()
  nodes.forEach((a, i) => {
    nodes.map((b, j) => [j, Math.hypot(a[0] - b[0], a[1] - b[1])] as const).filter(([j]) => j !== i).sort((m, n) => m[1] - n[1]).slice(0, 2)
      .forEach(([j]) => edges.add([Math.min(i, j), Math.max(i, j)].join('-')))
  })
  edges.forEach((k) => {
    const [i, j] = k.split('-').map(Number)
    const l = document.createElementNS(NS, 'line')
    l.setAttribute('x1', String(nodes[i][0])); l.setAttribute('y1', String(nodes[i][1]))
    l.setAttribute('x2', String(nodes[j][0])); l.setAttribute('y2', String(nodes[j][1]))
    l.setAttribute('class', 'cg-edge')
    svg.appendChild(l)
  })
  const labels = ['TOPIC', 'EVENT', 'CREW']
  nodes.forEach(([x, y], i) => {
    const c = document.createElementNS(NS, 'circle')
    c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('r', i < 3 ? '8' : '5')
    c.setAttribute('class', i < 3 ? 'cg-node hub' : 'cg-node')
    svg.appendChild(c)
    if (i < 3) {
      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x', String(x + 14)); t.setAttribute('y', String(y + 3)); t.setAttribute('class', 'cg-label')
      t.textContent = labels[i]
      svg.appendChild(t)
    }
  })
}

/** Machines: a white panel wipes up and the page inverts; tiles rise and their hexes draw. */
export function machines(_ctx: SceneCtx) {
  gsap.fromTo('.white-wipe', { scaleY: 0 }, { scaleY: 1, ease: 'power2.inOut', scrollTrigger: { trigger: '.machines', start: 'top 95%', end: 'top 20%', scrub: 1 } })
  const h = SplitText.create('.machines h2', { type: 'chars', mask: 'chars' })
  gsap.from(h.chars, { yPercent: 110, stagger: 0.025, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.machines h2', start: 'top 80%', toggleActions: 'play none none reverse' } })
  scrambleIn('.machines .kicker')
  const tiles = gsap.utils.toArray<HTMLElement>('.tile')
  gsap.timeline({ scrollTrigger: { trigger: '.m-grid', start: 'top 82%', toggleActions: 'play none none reverse' } })
    .from(tiles, { y: 80, opacity: 0, duration: 1.3, stagger: 0.1, ease: 'expo.out' })
    .from('.tile-hex polygon', { drawSVG: 0, duration: 1.4, stagger: 0.06, ease: 'expo.out' }, 0.2)
    .from('.tile-hex circle', { scale: 0, transformOrigin: '50% 50%', duration: 0.6, stagger: 0.1, ease: 'back.out(3)' }, 0.6)
  tiles.forEach((t) => gsap.to(t.querySelector('.tile-hex'), { rotation: 60, ease: 'none', scrollTrigger: { trigger: t, start: 'top bottom', end: 'bottom top', scrub: 1 } }))
  reveal('.machines-p', '.machines-p')
}

/** Cities: a small globe with the live-city pins. */
export function cities({ desktop }: SceneCtx) {
  let mini: Globe | null = null
  const canvas = document.querySelector<HTMLCanvasElement>('.globe-mini')!
  const st = ScrollTrigger.create({
    trigger: canvas, start: 'top 140%',
    onEnter: () => { if (!mini) { mini = new Globe(canvas, { points: desktop ? 6000 : 3000, arcs: true }); gsap.fromTo(mini.state, { arcs: 0 }, { arcs: 1, duration: 8, repeat: -1, ease: 'none' }) } },
  })
  gsap.from(canvas, { scale: 0.6, opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: canvas, start: 'top 85%', toggleActions: 'play none none reverse' } })
  return () => { st.kill(); mini?.dispose(); mini = null }
}

/** Final CTA: SplitText line reveal, button rises. */
/** Scenes: label scrambles, lead line rises, paragraphs follow. */
export function scenes(_ctx: SceneCtx) {
  gsap.utils.toArray<HTMLElement>('.scene').forEach((sc) => {
    const lead = sc.querySelector('.scene-lead')
    const split = lead ? SplitText.create(lead, { type: 'lines', mask: 'lines' }) : null
    const tl = gsap.timeline({ scrollTrigger: { trigger: sc, start: 'top 78%', toggleActions: 'play none none reverse' } })
    tl.from(sc, { borderTopColor: 'rgba(255,255,255,0)', duration: 0.6 })
      .from(sc.querySelector('.story'), { duration: 1, scrambleText: { text: '{original}', chars: SCRAMBLE } }, 0)
    if (split) tl.from(split.lines, { yPercent: 110, stagger: 0.08, duration: 1.1, ease: 'expo.out' }, 0.1)
    tl.from(sc.querySelectorAll('.scene-body p:not(.scene-lead)'), { y: 30, opacity: 0, stagger: 0.12, duration: 1, ease: 'expo.out' }, 0.35)
  })
}

export function cta(_ctx: SceneCtx) {
  const h = SplitText.create('.cta-h > span', { type: 'chars', mask: 'chars' })
  gsap.timeline({ scrollTrigger: { trigger: '.cta', start: 'top 65%', toggleActions: 'play none none reverse' } })
    .from(h.chars, { yPercent: 115, stagger: 0.018, duration: 1.2, ease: 'expo.out' })
    .from('.cta-btn', { y: 30, opacity: 0, duration: 1, ease: 'expo.out' }, 0.5)
    .from('.cta-line', { opacity: 0, duration: 1 }, 0.8)
}
