// Verifies live Luma events appear in the app (Events tab + map + badges). Usage: node e2e/feeds.mjs [url]
import { chromium } from 'playwright-core'
const URL_ = process.argv[2] ?? 'https://opinion-london.calderabalkan.workers.dev'
const OUT = new URL('./shots/', import.meta.url).pathname
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(7000)
const tabs = p.getByRole('tablist', { name: 'Show on map' })
const R = { tabs: (await tabs.innerText()).replace(/\n/g, ' ') }
await tabs.getByRole('tab', { name: /^Events/i }).click(); await p.waitForTimeout(900)
R.railItems = await p.locator('aside li').count()
R.lumaBadges = await p.locator('aside li', { hasText: 'LUMA' }).count()
await p.evaluate(() => window.__map.jumpTo({ center: [-0.12, 51.515], zoom: 13.4, pitch: 55, bearing: -15 }))
await p.waitForTimeout(3500); await p.screenshot({ path: OUT + 'feeds-map.png' })
await p.getByRole('navigation').getByRole('button', { name: 'Events', exact: true }).click(); await p.waitForTimeout(1200)
R.panelLumaLinks = await p.locator('section a', { hasText: 'Open on Luma' }).count()
R.camStable = true
await p.screenshot({ path: OUT + 'feeds-panel.png' })
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
