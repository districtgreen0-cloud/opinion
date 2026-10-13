// Traffic lights: visible when zoomed in, phases change, toggle works. Needs `npx vite preview --port 4701`.
import { chromium, webkit, devices } from 'playwright-core'
import fs from 'node:fs'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4701'); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(6000)
R.button = (await p.getByRole('button', { name: 'Traffic lights' }).innerText()).trim()
await p.evaluate(() => window.__map.jumpTo({ center: [-0.1210, 51.5115], zoom: 17, pitch: 58, bearing: -20 }))
await p.waitForTimeout(6000)
await p.screenshot({ path: OUT + 'signals-a.png' })
await p.waitForTimeout(25000) // half a cycle later → axes swap
await p.screenshot({ path: OUT + 'signals-b.png' })
R.framesDiffer = fs.readFileSync(OUT + 'signals-a.png').length !== fs.readFileSync(OUT + 'signals-b.png').length
await p.getByRole('button', { name: 'Traffic lights' }).click(); await p.waitForTimeout(1500)
R.afterToggle = (await p.getByRole('button', { name: 'Traffic lights' }).innerText()).trim()
await p.screenshot({ path: OUT + 'signals-off.png' })
await p.getByRole('button', { name: 'Traffic lights' }).click()
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.goto('http://localhost:4701'); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(4000)
await m.evaluate(() => window.__map.jumpTo({ center: [-0.1210, 51.5115], zoom: 17, pitch: 58 })); await m.waitForTimeout(5000)
await m.screenshot({ path: OUT + 'signals-iphone.png' })
console.log('iphone errs', JSON.stringify(errs))
await w.close()
