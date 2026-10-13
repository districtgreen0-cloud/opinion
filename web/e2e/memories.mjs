// Memories: camera-only capture per hex, 1 per hex, 3 per day, shown only inside the hex. Usage: node e2e/memories.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['camera'] })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
const spots = [[-0.1172, 51.5108], [-0.1200, 51.5113], [-0.1145, 51.5101], [-0.1225, 51.5120]]
async function openHex([lng, lat], first) {
  await p.evaluate(([lng, lat]) => window.__map.jumpTo({ center: [lng, lat], zoom: 17, pitch: 0, bearing: 0 }), [lng, lat]); await p.waitForTimeout(1200)
  const [x, y] = await p.evaluate(([lng, lat]) => { const q = window.__map.project([lng, lat]); return [q.x, q.y] }, [lng, lat])
  await p.mouse.click(x, y); await p.waitForTimeout(700)
  const sheet = p.locator('section').first()
  await sheet.getByRole('button', { name: /Teleport here/ }).click().catch(() => {}); await p.waitForTimeout(400)
  await sheet.getByRole('tab', { name: /^Memories/ }).click(); await p.waitForTimeout(400)
  return sheet
}
async function capture(sheet) {
  await sheet.getByRole('button', { name: 'Capture a memory' }).click()
  const cam = p.getByRole('dialog', { name: 'Capture a memory' })
  await cam.getByRole('button', { name: 'Take photo' }).and(p.locator(':enabled')).waitFor({ timeout: 30000 })
  await cam.getByRole('button', { name: 'Take photo' }).click(); await p.waitForTimeout(700)
  await cam.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(900)
}
let sheet = await openHex(spots[0])
R.tabs = (await sheet.getByRole('tablist', { name: 'Hex sections' }).innerText()).replace(/\n/g, ' ')
R.tiny = await sheet.getByText('1 per hex · 3 a day · camera only').count()
await p.screenshot({ path: OUT + 'mem-empty.png' })
await sheet.getByRole('button', { name: 'Capture a memory' }).click(); await p.getByRole('button', { name: 'Take photo' }).and(p.locator(':enabled')).waitFor({ timeout: 30000 }); await p.waitForTimeout(500)
await p.screenshot({ path: OUT + 'mem-camera.png' })
const cam = p.getByRole('dialog', { name: 'Capture a memory' })
await cam.getByRole('button', { name: 'Take photo' }).click(); await p.waitForTimeout(700)
await p.screenshot({ path: OUT + 'mem-preview.png' })
await cam.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(1000)
R.grid1 = await sheet.locator('img').count()
R.btnAfter = (await sheet.getByRole('button', { name: /memory here|Capture|Back tomorrow/ }).innerText()).trim()
await p.screenshot({ path: OUT + 'mem-grid.png' })
await sheet.locator('button[aria-label^="Memory by"]').first().click(); await p.waitForTimeout(600)
R.viewer = await p.getByRole('dialog', { name: 'Memory' }).count()
await p.screenshot({ path: OUT + 'mem-viewer.png' })
await p.getByRole('dialog', { name: 'Memory' }).getByRole('button', { name: 'Close' }).click()
for (const sp of spots.slice(1, 3)) { sheet = await openHex(sp); await capture(sheet) }
sheet = await openHex(spots[3])
R.fourth = (await sheet.getByRole('button', { name: /memory here|Capture|Back tomorrow/ }).innerText()).trim()
R.stored = await p.evaluate(() => JSON.parse(localStorage.getItem('opinion:memories')).length)
R.imgsOnMap = await p.evaluate(() => document.querySelectorAll('.maplibregl-marker img, .maplibregl-canvas-container img').length)
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(3000)
await m.evaluate(() => window.__map.jumpTo({ center: [-0.1172, 51.5108], zoom: 17, pitch: 0 })); await m.waitForTimeout(1200)
const [x, y] = await m.evaluate(() => { const q = window.__map.project([-0.1172, 51.5108]); return [q.x, q.y] })
await m.mouse.click(x, y); await m.waitForTimeout(800)
const ms = m.locator('section').first()
await ms.getByRole('button', { name: /Teleport here/ }).click().catch(() => {}); await m.waitForTimeout(300)
await ms.getByRole('tab', { name: /^Memories/ }).click(); await m.waitForTimeout(500)
await m.screenshot({ path: OUT + 'mem-iphone.png' })
console.log('iphone tabs', (await ms.getByRole('tablist', { name: 'Hex sections' }).innerText()).replace(/\n/g, ' '), 'errs', JSON.stringify(errs))
await w.close()
