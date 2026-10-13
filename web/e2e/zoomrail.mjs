// Zoom rail: tape follows zoom, drag zooms, compass resets north, clicks fire. Usage: node e2e/zoomrail.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
// count audio clicks
await p.addInitScript(() => { const o = AudioBufferSourceNode.prototype.start; window.__clicks = 0; AudioBufferSourceNode.prototype.start = function (...a) { window.__clicks++; return o.apply(this, a) } })
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(5000)
const rail = p.getByRole('slider', { name: 'Map zoom' })
R.railBox = await rail.boundingBox()
// the drag itself is the first gesture (unlocks audio)
R.z0 = await p.evaluate(() => window.__map.getZoom().toFixed(2))
R.readout0 = await rail.innerText()
const bx = R.railBox
await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down()
await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2 + 112, { steps: 20 }); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(800)
R.z1 = await p.evaluate(() => window.__map.getZoom().toFixed(2))
R.readout1 = await rail.innerText()
R.clicks = await p.evaluate(() => window.__clicks)
await p.screenshot({ path: OUT + 'zoomrail-desktop.png' })
await p.evaluate(() => window.__map.jumpTo({ bearing: 70 })); await p.waitForTimeout(400)
R.needle = await p.evaluate(() => document.querySelector('[aria-label="Reset map to north"] div').style.transform)
await p.getByRole('button', { name: 'Reset map to north' }).click(); await p.waitForTimeout(1300)
R.bearingAfter = await p.evaluate(() => Math.round(window.__map.getBearing()))
await p.getByRole('button', { name: 'Zoom in' }).click(); await p.waitForTimeout(900)
R.zIn = await p.evaluate(() => window.__map.getZoom().toFixed(2))
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(6000)
console.log('iphone rail', JSON.stringify(await m.getByRole('slider', { name: 'Map zoom' }).boundingBox()), 'errs', JSON.stringify(errs))
await m.screenshot({ path: OUT + 'zoomrail-iphone.png' })
await w.close()
