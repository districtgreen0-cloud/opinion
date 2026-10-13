import { gsap, ScrollTrigger, SCRAMBLE, type SceneCtx } from '../gsap'

const STATES: [number, string][] = [[0, 'OPEN'], [1.8, 'FUNDED'], [2.85, 'TAKEN'], [3.9, 'DELIVERED'], [4.85, 'PAID']]

/**
 * Escrow: one timeline (5 beats = POST, FUND, TAKE, DELIVER, RELEASE) owns the coin, the claim,
 * the proof and the vault lock. Desktop: pinned + scrubbed. Mobile: plays as a loop while visible.
 */
export function escrow({ desktop }: SceneCtx) {
  const root = document.querySelector<HTMLElement>('.escrow')!
  const value = root.querySelector<HTMLElement>('.es-value')!
  const steps = [...root.querySelectorAll<HTMLElement>('.es-steps li')]
  const lines = [...root.querySelectorAll<HTMLElement>('.cl[data-s]')]
  const vault = '.vault'
  let state = -1, step = -1

  const sync = (t: number) => {
    const s = Math.max(0, STATES.findLastIndex(([at]) => t >= at))
    if (s !== state) {
      state = s
      gsap.to(value, { duration: 0.5, overwrite: true, scrambleText: { text: STATES[s][1], chars: 'USDC$01', speed: 0.8 } })
    }
    const k = gsap.utils.clamp(0, 4, Math.floor(t))
    if (k !== step) {
      step = k
      steps.forEach((li, i) => li.classList.toggle('on', i === k))
      lines.forEach((l) => l.classList.toggle('on', Number(l.dataset.s) === k))
    }
  }

  gsap.set('#coin', { x: 120, y: 230 })
  gsap.set(['#proof', '#claim'], { x: 880, y: 230, opacity: 0 })
  gsap.set('.v-lock', { y: -9 })
  gsap.set('#p-refund', { drawSVG: 0 })

  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onUpdate: () => sync(tl.time()) })
  // 0 · POST — the poster opens a job in their hex
  tl.from('.node, .vault', { scale: 0.6, opacity: 0, transformOrigin: 'center', stagger: 0.12, duration: 0.5, ease: 'expo.out' }, 0)
    .fromTo('#p-fund', { drawSVG: 0 }, { drawSVG: '100%', duration: 0.6 }, 0.35)
    .to('.poster .halo', { rotation: 180, transformOrigin: 'center', duration: 1 }, 0)
    .fromTo('#coin', { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 0.5)
  // 1 · FUND — USDC rides the rail into the PDA vault, the lock shuts
    .to('#coin', { motionPath: { path: '#p-fund' }, duration: 0.6 }, 1.0)
    .to('#coin', { x: 500, y: 225, scale: 0.75, duration: 0.2, ease: 'power2.out' }, 1.6)
    .to('.v-lock', { y: 0, duration: 0.15, ease: 'back.out(3)' }, 1.78)
    .fromTo('.v-outer', { strokeWidth: 1.4 }, { strokeWidth: 4, duration: 0.08, yoyo: true, repeat: 1 }, 1.8)
    .to('.v-inner', { rotation: 60, transformOrigin: '50% 50%', duration: 0.6 }, 1.8)
  // 2 · TAKE — someone in the same hex claims it
    .fromTo('#p-take', { drawSVG: 0 }, { drawSVG: '100%', duration: 0.5 }, 2.0)
    .to('.worker .halo', { rotation: -180, transformOrigin: 'center', duration: 1 }, 2.0)
    .to('#claim', { opacity: 1, duration: 0.1 }, 2.35)
    .to('#claim', { motionPath: { path: '#p-take' }, duration: 0.5 }, 2.35)
    .to('#claim', { scale: 3, opacity: 0, transformOrigin: 'center', duration: 0.15 }, 2.85)
  // 3 · DELIVER — the worker attests the work is done
    .fromTo('#p-deliver', { drawSVG: 0 }, { drawSVG: '100%', duration: 0.45 }, 3.0)
    .to('#proof', { opacity: 1, duration: 0.1 }, 3.3)
    .to('#proof', { motionPath: { path: '#p-deliver' }, duration: 0.5 }, 3.3)
    .to('#proof', { opacity: 0, scale: 0.4, duration: 0.12 }, 3.8)
    .to('.v-inner', { rotation: 120, transformOrigin: '50% 50%', duration: 0.5 }, 3.6)
  // 4 · RELEASE — the poster signs, the vault pays the worker and closes
    .to('.v-lock', { y: -9, duration: 0.15, ease: 'back.out(3)' }, 4.0)
    .fromTo('#p-release', { drawSVG: 0 }, { drawSVG: '100%', duration: 0.45 }, 4.0)
    .to('#coin', { x: 580, y: 170, scale: 1, duration: 0.15 }, 4.15)
    .to('#coin', { motionPath: { path: '#p-release' }, duration: 0.55 }, 4.3)
    .to('.worker > circle:first-child', { fill: '#fff', duration: 0.1 }, 4.85)
    .to('.worker .nt', { fill: '#000', duration: 0.1 }, 4.85)
    .to('#coin', { scale: 0, duration: 0.12 }, 4.86)
    .fromTo('#p-refund', { drawSVG: 0 }, { drawSVG: '100%', duration: 0.4, ease: 'none' }, 4.6)
    .to({}, { duration: 0.35 })

  if (desktop) {
    ScrollTrigger.create({ animation: tl, trigger: '.escrow', start: 'top top', end: '+=420%', pin: '.escrow-inner', scrub: 1, anticipatePin: 1 })
  } else {
    tl.pause().repeat(-1).repeatDelay(1.4).timeScale(0.55)
    ScrollTrigger.create({ trigger: '.escrow-diagram', start: 'top 85%', end: 'bottom 10%', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) })
  }
  sync(0)

  gsap.from('.escrow-head > *', { y: 40, opacity: 0, stagger: 0.1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.escrow', start: 'top 75%', toggleActions: 'play none none reverse' } })
  gsap.from('.escrow-head .kicker', { duration: 1.2, scrambleText: { text: '{original}', chars: SCRAMBLE }, scrollTrigger: { trigger: '.escrow', start: 'top 75%' } })
  gsap.from('.escrow-code', { clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.inOut', scrollTrigger: { trigger: '.escrow-grid', start: 'top 80%', toggleActions: 'play none none reverse' } })
  gsap.from('.escrow > .escrow-facts li', { y: 40, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.escrow > .escrow-facts', start: 'top 88%', toggleActions: 'play none none reverse' } })
}
