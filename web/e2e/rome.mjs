// Rome: Colosseum hologram on the real site + "Enter the Arena" slab → colosseum.com. Usage: node e2e/rome.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4700'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:city2', JSON.stringify('rom')) }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
R.city = (await p.getByRole('button', { name: /Roma/ }).first().innerText()).trim()
await p.evaluate(() => window.__map.jumpTo({ center: [12.4922, 41.8885], zoom: 16.3, pitch: 62, bearing: -20 })); await p.waitForTimeout(3500)
await p.screenshot({ path: OUT + 'rome-1-colosseum.png' })
await p.evaluate(() => window.__map.jumpTo({ center: [12.4935, 41.8895], zoom: 17.2, pitch: 70, bearing: 40 })); await p.waitForTimeout(2500)
await p.evaluate(() => window.__map.jumpTo({ center: [12.4922, 41.8930], zoom: 16, pitch: 45, bearing: 0 })); await p.waitForTimeout(1500) // slab clear of the top bar
await p.screenshot({ path: OUT + 'rome-2-close.png' })
R.slab = (await p.locator('.bp-label.glitch').innerText()).replace(/\n/g, ' | ')
const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), p.locator('.bp-label.glitch').click({ force: true })])
R.opened = popup ? popup.url() : null
await popup?.close()
await p.waitForTimeout(1200)
R.eventCard = (await p.locator('text=Enter the Arena').first().innerText().catch(() => '')).trim()
R.ticketLink = await p.locator('a[href="https://www.colosseum.com/"]').count()
await p.screenshot({ path: OUT + 'rome-3-event.png' })
console.log(JSON.stringify({ R, errs }))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(3000)
await m.evaluate(() => window.__map.jumpTo({ center: [12.4922, 41.8880], zoom: 16, pitch: 60, bearing: -20 })); await m.waitForTimeout(3500)
await m.screenshot({ path: OUT + 'rome-iphone.png' })
console.log('iphone errs', JSON.stringify(errs))
await w.close()
