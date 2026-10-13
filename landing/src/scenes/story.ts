import { gsap, ScrollTrigger, SplitText, SCRAMBLE, type SceneCtx } from '../gsap'

/** Manifesto: three lines scrubbed word by word from 15% to 100% white. */
export function manifesto({ desktop }: SceneCtx) {
  const split = SplitText.create('.m-line', { type: 'words' })
  gsap.set(split.words, { opacity: 0.15 })
  const tl = gsap.timeline({
    scrollTrigger: desktop
      ? { trigger: '.manifesto', start: 'top top', end: '+=170%', pin: true, scrub: 1, anticipatePin: 1 }
      : { trigger: '.m-lines', start: 'top 80%', end: 'bottom 40%', scrub: 1 },
  })
  tl.to(split.words, { opacity: 1, stagger: 0.12, duration: 0.5, ease: 'none' })
    .from('.m-body p', { opacity: 0, y: 30, stagger: 0.2, duration: 0.8 }, '-=0.6')
    .to({}, { duration: 0.4 })
}

/** How it works: horizontal pinned track on desktop; vertical stack on mobile. DrawSVG diagrams. */
export function how({ desktop }: SceneCtx) {
  const track = document.querySelector<HTMLElement>('.how-track')!
  const panels = gsap.utils.toArray<HTMLElement>('.how-panel:not(.how-intro)')
  const draw = (panel: HTMLElement, st: ScrollTrigger.Vars) => {
    const tl = gsap.timeline({ scrollTrigger: { ...st, toggleActions: 'play none none reverse' } })
    tl.from(panel.querySelectorAll('.d'), { drawSVG: 0, duration: 1.4, stagger: 0.12, ease: 'expo.out' })
      .from(panel.querySelectorAll('.dot'), { scale: 0, transformOrigin: 'center', duration: 0.6, ease: 'back.out(3)' }, 0.4)
      .from(panel.querySelector('.how-n'), { yPercent: 60, opacity: 0, duration: 1, ease: 'expo.out' }, 0)
      .from(panel.querySelectorAll('h3, p'), { y: 24, opacity: 0, stagger: 0.08, duration: 0.9, ease: 'expo.out' }, 0.15)
  }

  if (desktop) {
    const dist = () => track.scrollWidth - innerWidth
    const h = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: '.how', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true },
    })
    panels.forEach((p) => draw(p, { trigger: p, containerAnimation: h, start: 'left 72%' }))
  } else {
    panels.forEach((p) => draw(p, { trigger: p, start: 'top 75%' }))
  }
  gsap.from('.how-intro > *', { y: 40, opacity: 0, stagger: 0.1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.how', start: 'top 70%', toggleActions: 'play none none reverse' } })
  gsap.from('.how-intro .kicker', { duration: 1, scrambleText: { text: '{original}', chars: SCRAMBLE }, scrollTrigger: { trigger: '.how', start: 'top 70%' } })
}
