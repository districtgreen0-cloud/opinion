import gsap from 'gsap'

/**
 * App-wide click motion. One delegated listener gives every button, link-chip, radio and switch:
 *  - a glass ripple that blooms from the touch point (clipped to the element's own radius)
 *  - a squash-and-spring press
 * No per-component wiring needed; respects prefers-reduced-motion.
 */
const SELECTOR = 'button, a.chip, a.btn-ghost, [role="radio"], [role="switch"]'

export function installClickFx() {
  if (typeof window === 'undefined') return () => {}
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  const onDown = (e: PointerEvent) => {
    if (reduced.matches) return
    const el = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR)
    if (!el || (el as HTMLButtonElement).disabled || el.closest('.maplibregl-map')) return

    if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
    const r = el.getBoundingClientRect()
    const clip = document.createElement('span')
    clip.className = 'fx-clip'
    const dot = document.createElement('span')
    dot.className = 'fx-ripple'
    dot.style.left = `${e.clientX - r.left}px`
    dot.style.top = `${e.clientY - r.top}px`
    clip.appendChild(dot)
    el.appendChild(clip)

    const reach = (Math.hypot(r.width, r.height) * 2.2) / 12
    gsap.fromTo(dot, { scale: 0, opacity: 1 }, { scale: reach, opacity: 0, duration: 0.75, ease: 'power2.out', onComplete: () => clip.remove() })
    gsap.fromTo(el, { scale: 0.95 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1.1, 0.45)', clearProps: 'scale', overwrite: 'auto' })
  }

  document.addEventListener('pointerdown', onDown, { passive: true })
  return () => document.removeEventListener('pointerdown', onDown)
}
