// 10k / 1M user simulation: cubes, proportional split, dots across the whole town. Usage: node e2e/sim.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
let t0 = Date.now()
await p.getByRole('button', { name: 'Simulate 10 thousand users' }).click(); await p.waitForTimeout(3500)
R.t10k = Date.now() - t0
R.label10k = (await p.locator('text=/^sim ·/i').first().innerText()).trim()
R.zoom10k = await p.evaluate(() => [+window.__map.getZoom().toFixed(2), window.__map.getProjection().type])
await p.screenshot({ path: OUT + 'sim-10k.png' })
t0 = Date.now()
await p.getByRole('button', { name: 'Simulate 1 million users' }).click(); await p.waitForTimeout(4000)
R.t1m = Date.now() - t0
R.label1m = (await p.locator('text=/^sim ·/i').first().innerText()).trim()
R.fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; performance.now() - t < 2000 ? requestAnimationFrame(f) : res(Math.round(n / 2)) }; window.__map.easeTo({ bearing: 25, duration: 2000 }); requestAnimationFrame(f) }))
await p.screenshot({ path: OUT + 'sim-1m.png' })
await p.evaluate(() => window.__map.jumpTo({ center: [-0.1240, 51.5120], zoom: 15.2, pitch: 50, bearing: 0 })); await p.waitForTimeout(2500)
await p.screenshot({ path: OUT + 'sim-1m-street.png' })
// Belgrade proportional
await p.getByRole('button', { name: /London/ }).first().click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: /Beograd/ }).first().click(); await p.waitForTimeout(9000)
R.labelBgd = (await p.locator('text=/^sim ·/i').first().innerText()).trim()
await p.getByRole('button', { name: 'Simulate 1 million users' }).click(); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Simulate 1 million users' }).click(); await p.waitForTimeout(3500)
await p.screenshot({ path: OUT + 'sim-bgd.png' })
await p.getByRole('button', { name: 'Simulate 1 million users' }).click(); await p.waitForTimeout(800)
R.off = await p.locator('text=/^sim ·/i').count()
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(3000)
await m.getByRole('button', { name: 'Simulate 1 million users' }).click(); await m.waitForTimeout(5000)
await m.screenshot({ path: OUT + 'sim-iphone.png' })
console.log('iphone toast/label', (await m.locator('text=/^sim ·/i').first().innerText()).trim(), 'errs', JSON.stringify(errs))
await w.close()
