/** Fixed bottom HUD: UTC clock, sliding ruler, needle and a `034.092`-style progress counter. */
export function hud() {
  const clock = document.querySelector('.hud-clock')!
  const prog = document.querySelector('.hud-prog')!
  const ruler = document.querySelector<HTMLElement>('.hud-ruler')!
  const needle = document.querySelector<HTMLElement>('.hud-needle')!
  const tick = () => { clock.textContent = new Date().toISOString().slice(11, 19) + ' UTC' }
  tick()
  setInterval(tick, 1000)

  let raf = 0
  const update = () => {
    raf = 0
    const max = document.documentElement.scrollHeight - innerHeight
    const y = scrollY
    const p = max > 0 ? Math.min(1, y / max) : 0
    const v = (p * 100).toFixed(3).padStart(7, '0')
    prog.textContent = v
    ruler.style.backgroundPosition = `${-y * 0.35}px bottom, ${-y * 0.35}px bottom`
    needle.style.transform = `translateX(${p * ruler.clientWidth}px)`
  }
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update) }, { passive: true })
  addEventListener('resize', update)
  update()
}
