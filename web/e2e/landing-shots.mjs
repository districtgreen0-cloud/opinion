// Captures colour screenshots of the live app for the landing page → ../landing/assets/. Usage: node e2e/landing-shots.mjs
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = 'https://opinion-london.calderabalkan.workers.dev/'
const OUT = new URL('../../landing/assets/', import.meta.url).pathname
const init = (city) => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:city2', JSON.stringify(city)) }
const HIDE_UI = 'main > div.z-10, main > div.z-\\[1\\] { display: none !important } .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { display:none !important }'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
async function shot(name, city, view, { ui = false, sport = false, labels = true, wait = 9000 } = {}) {
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage()
  await p.addInitScript(init, city)
  await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(4000)
  if (sport) { await p.getByRole('tab', { name: /^Sports/i }).click(); await p.waitForTimeout(1500) }
  await p.evaluate((v) => window.__map.jumpTo(v), view); await p.waitForTimeout(wait)
  if (!ui) await p.addStyleTag({ content: HIDE_UI + (labels ? '' : ' .bp-label, .bubble { display:none !important }') })
  await p.waitForTimeout(600)
  await p.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 90 })
  console.log('✓', name)
  await p.close()
}
await shot('hero-london-hackerhouse', 'ldn', { center: [-0.1172, 51.5106], zoom: 16.9, pitch: 66, bearing: -24 })
await shot('breakpoint-olympia', 'ldn', { center: [-0.2096, 51.4963], zoom: 16.8, pitch: 64, bearing: 30 })
await shot('belgrade-build-station', 'bgd', { center: [20.4557, 44.8087], zoom: 17.2, pitch: 64, bearing: -40 }, { labels: false })
await shot('stadium-emirates', 'ldn', { center: [-0.1086, 51.5549], zoom: 16.3, pitch: 62, bearing: -30 }, { sport: true })
await shot('signals-hexgrid-strand', 'ldn', { center: [-0.1225, 51.5113], zoom: 17.4, pitch: 58, bearing: -20 }, { labels: false })
await shot('sf-soma-night', 'sf', { center: [-122.4005, 37.7845], zoom: 16.2, pitch: 64, bearing: 28 })
await shot('app-desktop-sports', 'ldn', { center: [-0.135, 51.53], zoom: 13.2, pitch: 50, bearing: -20 }, { ui: true, sport: true })
await shot('app-desktop-london', 'ldn', { center: [-0.1172, 51.5108], zoom: 16.2, pitch: 62, bearing: -24 }, { ui: true })
// world globe (fresh session, no city entered)
{
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage()
  await p.addInitScript(() => sessionStorage.setItem('opinion:splash', '1'))
  await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
  await p.addStyleTag({ content: HIDE_UI }); await p.waitForTimeout(800)
  await p.screenshot({ path: OUT + 'globe-world.jpg', type: 'jpeg', quality: 90 }); console.log('✓ globe-world')
  await p.close()
}
// the loading globe
{
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage()
  await p.goto(URL_); await p.waitForTimeout(3200)
  await p.screenshot({ path: OUT + 'splash-globe.jpg', type: 'jpeg', quality: 90 }); console.log('✓ splash-globe')
  await p.close()
}
await b.close()
// phones
const w = await webkit.launch()
async function phone(name, city, fn) {
  const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
  await m.addInitScript(init, city)
  await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(9000)
  if (fn) await fn(m)
  await m.screenshot({ path: OUT + name + '.png' }); console.log('✓', name)
  await m.close()
}
await phone('phone-london', 'ldn')
await phone('phone-belgrade', 'bgd')
await phone('phone-sports', 'ldn', async (m) => { await m.getByRole('tab', { name: /^Sports/i }).click(); await m.evaluate(() => window.__map.jumpTo({ center: [-0.2795, 51.556], zoom: 15.3, pitch: 60, bearing: 20 })); await m.waitForTimeout(7000) })
await phone('phone-profile', 'ldn', async (m) => { await m.locator('.bubble').first().click({ timeout: 20000 }).catch(() => {}); await m.waitForTimeout(900) })
{
  const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
  await m.addInitScript(() => sessionStorage.setItem('opinion:splash', '1'))
  await m.goto(URL_); await m.getByRole('dialog', { name: 'Choose your city' }).waitFor({ timeout: 120000 }); await m.waitForTimeout(2800)
  await m.screenshot({ path: OUT + 'phone-city-reel.png' }); console.log('✓ phone-city-reel')
  await m.close()
}
await w.close()
