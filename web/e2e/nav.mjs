// Location cube (real GPS), camera cube, navigation (route, HUD, modes, simulate, end). Usage: node e2e/nav.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const HOME = { latitude: 51.5108, longitude: -0.1172 } // Somerset House
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, geolocation: HOME, permissions: ['geolocation', 'camera'] })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
// 📍
await p.getByRole('button', { name: 'Turn on location' }).click(); await p.waitForTimeout(3000)
R.locOn = await p.getByRole('button', { name: /Location on/ }).count()
R.center = await p.evaluate(() => { const c = window.__map.getCenter(); return [+c.lng.toFixed(4), +c.lat.toFixed(4)] })
// 📷
await p.getByRole('button', { name: 'Capture a memory here' }).click(); await p.waitForTimeout(2500)
R.cameraOpen = await p.getByRole('dialog', { name: 'Capture a memory' }).count()
R.hexTab = await p.locator('section [role=tab][aria-selected=true]').innerText().catch(() => '')
await p.getByRole('button', { name: 'Close camera' }).click(); await p.waitForTimeout(300)
await p.locator('section').first().getByRole('button', { name: 'Close' }).first().click(); await p.waitForTimeout(500)
// 🧭 navigate to Trafalgar Square
await p.evaluate(() => window.__map.jumpTo({ center: [-0.1280, 51.5080], zoom: 16.5, pitch: 0, bearing: 0 })); await p.waitForTimeout(1500)
const [x, y] = await p.evaluate(() => { const q = window.__map.project([-0.1280, 51.5080]); return [q.x, q.y] })
await p.mouse.click(x, y); await p.waitForTimeout(800)
await p.locator('section').first().getByRole('button', { name: 'Navigate here' }).click(); await p.waitForTimeout(5000)
R.routePts = await p.evaluate(() => window.__map.getSource('nav-route')._data?.features?.[0]?.geometry?.coordinates?.length ?? 0)
R.hud = (await p.locator('text=/^→ /').first().innerText().catch(() => '')).slice(0, 60)
R.next = (await p.locator('.num.text-\\[20px\\]').first().innerText().catch(() => '')) + ' · ' + (await p.locator('.num.text-\\[20px\\] + div').first().innerText().catch(() => ''))
await p.screenshot({ path: OUT + 'nav-route.png' })
await p.getByRole('button', { name: '🚲 Bike' }).click(); await p.waitForTimeout(4000)
R.bikeColor = await p.evaluate(() => window.__map.getPaintProperty('nav-line', 'line-color'))
const before = await p.evaluate(() => window.__map.getSource('nav-route')._data?.features?.[0]?.geometry?.coordinates?.length ?? 0)
await p.getByRole('button', { name: '▶ Simulate' }).click(); await p.waitForTimeout(9000)
const after = await p.evaluate(() => window.__map.getSource('nav-route')._data?.features?.[0]?.geometry?.coordinates?.length ?? 0)
R.simShrinks = [before, after]
R.pitch = await p.evaluate(() => Math.round(window.__map.getPitch()))
await p.screenshot({ path: OUT + 'nav-sim.png' })
await p.getByRole('button', { name: 'End', exact: true }).click(); await p.waitForTimeout(800)
R.ended = await p.evaluate(() => window.__map.getSource('nav-route')._data?.features?.length ?? 0)
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const mctx = await w.newContext({ ...devices['iPhone 15'], geolocation: HOME, permissions: ['geolocation'] })
const m = await mctx.newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(3000)
await m.screenshot({ path: OUT + 'nav-iphone-controls.png' })
await m.getByRole('button', { name: 'Turn on location' }).click(); await m.waitForTimeout(3000)
await m.evaluate(() => window.__map.jumpTo({ center: [-0.1280, 51.5080], zoom: 16.5, pitch: 0 })); await m.waitForTimeout(1500)
const [mx, my] = await m.evaluate(() => { const q = window.__map.project([-0.1280, 51.5080]); return [q.x, q.y] })
await m.mouse.click(mx, my); await m.waitForTimeout(800)
await m.locator('section').first().getByRole('button', { name: 'Navigate here' }).click(); await m.waitForTimeout(6000)
await m.screenshot({ path: OUT + 'nav-iphone.png' })
console.log('iphone errs', JSON.stringify(errs))
await w.close()
