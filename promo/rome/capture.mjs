// Records the real app (live site) flying into Rome and orbiting the Colosseum hologram → out/rome/footage.webm
// Usage: node rome/capture.mjs [appUrl]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const URL_ = process.argv[2] ?? 'https://app.useopinion.io/'
const OUT = new URL('../out/rome/', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const W = 1920, H = 1080
const marks = [] // [label, seconds] — caption timing for build.mjs
const t0 = Date.now()
const mark = (label) => marks.push([label, +((Date.now() - t0) / 1000).toFixed(2)])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--hide-scrollbars'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: W, height: H } } })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
// fresh visitor: splash → world map → city strip. Dark theme, London remembered so the strip starts on London and we pick Roma.
await p.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('opinion:theme', JSON.stringify('dark')) } catch {} })
await p.goto(URL_)
mark('splash')
await p.waitForFunction(() => !document.querySelector('.sp-text'), null, { timeout: 90000 })
mark('world')
await p.getByRole('dialog', { name: 'Choose your city' }).waitFor({ timeout: 30000 })
await wait(900)
await p.locator('.cp-chip', { hasText: 'Roma' }).click() // the map pans to Rome
await wait(1800)
await p.getByRole('button', { name: 'Fly in →' }).click()
mark('flyin')
await wait(6500) // the cinematic arc lands in the streets
mark('landed')
// only events on the map: hides the chat bubbles so the hologram is clean
await p.getByRole('tab', { name: /^Events/i }).first().click().catch(() => {})
await wait(400)
// line up on the arena, then a slow 360° orbit
const jump = (o) => p.evaluate((o) => window.__map.easeTo({ ...o, essential: true }), o)
await jump({ center: [12.4922, 41.8895], zoom: 16.4, pitch: 62, bearing: -30, duration: 2200 })
await wait(2400)
mark('orbit')
await p.evaluate(() => window.__map.easeTo({ bearing: 330, duration: 14000, easing: (t) => t, essential: true }))
await wait(14200)
mark('close')
await jump({ center: [12.4935, 41.8898], zoom: 17.3, pitch: 72, bearing: 40, duration: 2600 })
await wait(5200)
mark('slab')
// pull back so the "Enter the Arena" slab sits clear above the hologram
await jump({ center: [12.4922, 41.8925], zoom: 16.1, pitch: 50, bearing: 0, duration: 2200 })
await wait(3400)
mark('events')
await p.getByRole('button', { name: 'Events' }).first().click()
await wait(4200)
mark('end')
await p.getByRole('button', { name: 'Explore' }).first().click().catch(() => {})
await jump({ center: [12.4922, 41.8905], zoom: 15.4, pitch: 58, bearing: -20, duration: 3000 })
await wait(3600)
mark('stop')
await ctx.close()
await b.close()
const webm = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).map((f) => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
fs.renameSync(webm, path.join(OUT, 'footage.webm'))
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(Object.fromEntries(marks), null, 1))
console.log('footage.webm', JSON.stringify(Object.fromEntries(marks)))
