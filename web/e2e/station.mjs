// Belgrade Old Railway Station art: renders aligned on its real footprint. Needs `npx vite preview --port 4701`.
import { chromium } from 'playwright-core'
const OUT = new URL('./shots/', import.meta.url).pathname
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await ctx.addInitScript(() => localStorage.setItem('opinion:city2', JSON.stringify('bgd')))
const p = await ctx.newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4701'); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(6000)
await p.screenshot({ path: OUT + 'bgd-city.png' })
const views = [
  ['front', { center: [20.4560, 44.8090], zoom: 17.4, pitch: 62, bearing: 150 }],
  ['angle', { center: [20.4557, 44.8087], zoom: 17.0, pitch: 66, bearing: 105 }],
  
]
for (const [n, v] of views) {
  await p.evaluate((v) => window.__map.jumpTo(v), v)
  await p.waitForTimeout(4500)
  await p.screenshot({ path: OUT + `station-${n}.png` })
}
console.log(JSON.stringify({ label: await p.locator('.bp-label.gold').innerText().catch(() => null), errs }, null, 1))
await b.close()
