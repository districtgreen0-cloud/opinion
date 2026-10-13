// Light / dark / system theme: cube cycles, map + UI follow, panels readable. Usage: node e2e/theme.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(4000)
const cube = p.getByRole('button', { name: /^Appearance/ })
R.start = [await p.evaluate(() => document.documentElement.dataset.theme), await cube.getAttribute('aria-label')]
await cube.click(); await p.waitForTimeout(2500) // dark → light
R.light = [await p.evaluate(() => document.documentElement.dataset.theme), await p.evaluate(() => window.__map.getPaintProperty('bg', 'background-color')), await p.evaluate(() => getComputedStyle(document.body).backgroundColor)]
await p.screenshot({ path: OUT + 'theme-light-desktop.png' })
// hex sheet + market panel in light
const [x, y] = await p.evaluate(() => { const q = window.__map.project([-0.1172, 51.5108]); return [q.x, q.y] })
await p.mouse.click(x, y + 60); await p.waitForTimeout(1200)
await p.screenshot({ path: OUT + 'theme-light-hex.png' })
await p.keyboard.press('Escape')
await p.locator('section').first().getByRole('button', { name: 'Close' }).click().catch(() => {})
await p.getByRole('button', { name: 'Market' }).click(); await p.waitForTimeout(1200)
await p.screenshot({ path: OUT + 'theme-light-market.png' })
await p.getByRole('button', { name: 'Explore' }).click(); await p.waitForTimeout(500)
await cube.click(); await p.waitForTimeout(1500) // light → system (OS = light here)
R.system = [await p.evaluate(() => document.documentElement.dataset.theme), await cube.getAttribute('aria-label')]
await cube.click(); await p.waitForTimeout(1500) // system → dark
R.dark = [await p.evaluate(() => document.documentElement.dataset.theme), await p.evaluate(() => window.__map.getPaintProperty('bg', 'background-color'))]
// reload keeps the choice, no flash
await cube.click(); await p.waitForTimeout(500)
await p.reload(); R.afterReload = await p.evaluate(() => document.documentElement.dataset.theme)
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'], colorScheme: 'light' })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(() => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:theme', '"light"') })
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(7000)
await m.screenshot({ path: OUT + 'theme-light-iphone.png' })
await m.getByRole('tab', { name: /^Sports/i }).click(); await m.waitForTimeout(2500)
await m.screenshot({ path: OUT + 'theme-light-iphone-sports.png' })
console.log('iphone', await m.evaluate(() => document.documentElement.dataset.theme), 'errs', JSON.stringify(errs))
await w.close()
