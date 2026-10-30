// Deterministic cards (seekable): intro 0–6 s · hackathon 6–20 s · outro 20–27 s. render-cards.mjs drives window.__seek(t).
import gsap from 'gsap'

const INTRO = 6, HACK = 14, OUTRO = 7
export const DURATION = INTRO + HACK + OUTRO

// scan-line Colosseum silhouette: a few elliptical tiers + arch ticks, drawn once
const g = document.getElementById('arenaG')
const ell = (rx, ry, y, op) => `<ellipse cx="0" cy="${y}" rx="${rx}" ry="${ry}" style="stroke-opacity:${op}"/>`
let svg = ''
for (let k = 0; k < 5; k++) svg += ell(300 - k * 32, 110 - k * 11, 40 + k * 6, 0.9 - k * 0.15)
for (let k = 0; k < 3; k++) svg += ell(300, 110, 40 - k * 48, 0.9) // outer storeys
for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; const x = Math.cos(a) * 300, y = Math.sin(a) * 110; svg += `<line x1="${x}" y1="${40 + y}" x2="${x}" y2="${40 + y - 96}" style="stroke-opacity:.5"/>` }
g.innerHTML = svg

const streaks = document.getElementById('streaks')
const S = []
for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'streak ' + (i % 3 === 0 ? 'v' : i % 3 === 1 ? 't' : ''); streaks.appendChild(d); S.push(d) }
const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }

const tl = gsap.timeline({ paused: true })
const q = (s) => document.querySelector(s)
// intro
tl.to('#intro', { opacity: 1, duration: 0.6 }, 0.2)
  .from('#intro h1', { scale: 1.25, filter: 'blur(14px)', duration: 1.4, ease: 'expo.out' }, 0.3)
  .from('#intro .sub', { y: 14, opacity: 0, duration: 0.9 }, 1.1)
  .from('.arena', { scale: 0.8, opacity: 0, duration: 2.2, ease: 'expo.out' }, 0.2)
  .to('#intro', { opacity: 0, duration: 0.5 }, INTRO - 0.5)
// hackathon
tl.to('#hack', { opacity: 1, duration: 0.6 }, INTRO)
  .from('#hack h2', { y: 30, filter: 'blur(10px)', duration: 1.1, ease: 'expo.out' }, INTRO + 0.1)
  .from('#hack .sub', { y: 14, opacity: 0, duration: 0.9 }, INTRO + 0.9)
  .to('#hack .step', { opacity: 1, y: 0, duration: 0.8, stagger: 0.35, ease: 'expo.out' }, INTRO + 1.8)
  .from('#hack .url', { scale: 0.85, opacity: 0, duration: 0.7, ease: 'back.out(1.6)' }, INTRO + 3.4)
  .to('#hack', { opacity: 0, duration: 0.5 }, INTRO + HACK - 0.5)
// outro
tl.to('#outro', { opacity: 1, duration: 0.6 }, INTRO + HACK)
  .from('#outro .logo', { scale: 0.9, filter: 'blur(10px)', duration: 1.2, ease: 'expo.out' }, INTRO + HACK + 0.1)
  .from('#outro .hex', { rotate: -40, scale: 0.6, duration: 2.4, ease: 'expo.out' }, INTRO + HACK)
  .from('#outro .sub, #outro .url', { y: 14, opacity: 0, duration: 0.9, stagger: 0.25 }, INTRO + HACK + 0.9)
  .to('#stage', { opacity: 0, duration: 0.8 }, DURATION - 0.8)

function update(t) {
  // glitch bursts on the big titles: a few frames every ~1.3 s
  const burst = hash(Math.floor(t * 6)) > 0.78
  document.querySelectorAll('.g').forEach((el) => el.classList.toggle('on', burst))
  // streaks jump around
  S.forEach((d, i) => {
    const slot = Math.floor(t * (2 + (i % 4)) + i * 7)
    const on = hash(slot + i * 0.37) > 0.5
    d.style.opacity = on ? String(0.5 + hash(slot + 3) * 0.5) : '0'
    d.style.left = `${hash(slot + 1) * 1700}px`
    d.style.top = `${160 + hash(slot + 2) * 760}px`
    d.style.width = `${40 + hash(slot + 4) * 220}px`
  })
  // the arena silhouette drifts slowly
  const a = document.querySelector('.arena')
  a.style.transform = `translate(-50%, -50%) rotate(${Math.sin(t * 0.3) * 2}deg) translateY(${Math.sin(t * 0.5) * 8}px)`
  a.style.opacity = t < INTRO ? '.42' : t < INTRO + HACK ? '.16' : '0'
}

window.__duration = DURATION
window.__seek = (t) => { tl.seek(t, false); update(t) }
window.__ready = true
if (location.hash === '#play') { let t = 0; const t0 = performance.now(); const loop = () => { t = (performance.now() - t0) / 1000; window.__seek(t % DURATION); requestAnimationFrame(loop) }; loop() }
