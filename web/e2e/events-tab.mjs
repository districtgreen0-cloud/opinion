// Verifies the EVENTS home tab on desktop + mobile. Needs `npx vite preview --port 4701`.
import { chromium } from 'playwright-core'
const OUT = new URL('./shots/', import.meta.url).pathname
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const errs = []
const R = {}
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4701'); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(6500)
const tabs = p.getByRole('tablist', { name: 'Show on map' })
R.tabs = (await tabs.innerText()).replace(/\n/g, ' ')
await tabs.getByRole('tab', { name: /^Events/i }).click(); await p.waitForTimeout(900)
R.railTitle = (await p.locator('aside button').first().innerText()).trim()
R.railItems = await p.locator('aside li').count()
R.railFirst = (await p.locator('aside li').first().innerText()).replace(/\n/g, ' | ')
R.bubblesHidden = (await p.locator('.bubble').count()) === 0
await p.screenshot({ path: OUT + 'events-tab.png' })
await p.locator('aside li', { hasText: 'Breakpoint' }).first().click(); await p.waitForTimeout(2600)
R.sheetTitle = await p.locator('section h2').first().innerText()
await p.screenshot({ path: OUT + 'events-tab-bp.png' })
// switching back restores bubbles
await p.locator('section button[aria-label=Close]').click()
await tabs.getByRole('tab', { name: /^All/i }).click(); await p.waitForTimeout(900)
R.bubblesBack = (await p.locator('.bubble').count()) > 0
// mobile
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
m.on('pageerror', (e) => errs.push('mobile ' + e.message))
await m.goto('http://localhost:4701'); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(6500)
const mt = m.getByRole('tablist', { name: 'Show on map' })
R.mobileTabsBox = await mt.evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth, document.documentElement.scrollWidth] })
await mt.getByRole('tab', { name: /^Events/i }).click(); await m.waitForTimeout(900)
R.mobileStrip = await m.evaluate(() => {
  const strip = [...document.querySelectorAll('.snap-x')][0]?.getBoundingClientRect()
  const ctl = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Centre')?.getBoundingClientRect()
  return strip && ctl ? { stripTop: Math.round(strip.top), controlsBottom: Math.round(ctl.bottom), overlap: ctl.bottom > strip.top } : null
})
await m.screenshot({ path: OUT + 'events-tab-mobile.png' })
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
