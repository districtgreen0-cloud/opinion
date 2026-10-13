// Sports tab: fixtures list, stadium footprints/icons/labels, game tags, venue click, iPhone. Usage: node e2e/sports.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'https://opinion-london.calderabalkan.workers.dev'
const OUT = new URL('./shots/', import.meta.url).pathname
const R = {}, errs = []
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text().slice(0, 160)))
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(4000)
const tabs = p.getByRole('tablist', { name: 'Show on map' })
R.tabs = (await tabs.innerText()).replace(/\n/g, ' ')
await tabs.getByRole('tab', { name: /^Sports/i }).click(); await p.waitForTimeout(2500)
const rail = p.locator('aside')
R.railHead = (await rail.locator('button').first().innerText()).trim()
R.games = await rail.locator('li', { hasText: /🏟/ }).count()
R.firstGame = R.games ? (await rail.locator('li', { hasText: /🏟/ }).first().innerText()).replace(/\n/g, ' | ').slice(0, 120) : null
R.venues = await rail.locator('li').count() - R.games
R.layers = await p.evaluate(() => window.__map.getStyle().layers.map((l) => l.id).filter((id) => /sport|game/.test(id)))
await p.screenshot({ path: OUT + 'sports-ldn.png' })
// fly to the first game (or the first stadium) and look at it up close
const first = R.games ? rail.locator('li', { hasText: /🏟/ }).first().locator('button').first() : rail.locator('li').first().locator('button')
await first.click(); await p.waitForTimeout(5500)
R.place = (await p.locator('section').first().innerText().catch(() => '')).split('\n').slice(0, 3).join(' | ')
await p.screenshot({ path: OUT + 'sports-venue.png' })
// courts around Regent's Park at street level
await p.locator('section').first().getByRole('button', { name: 'Close' }).click().catch(() => {})
await p.evaluate(() => window.__map.jumpTo({ center: [-0.1527, 51.5313], zoom: 16, pitch: 55, bearing: 0 })); await p.waitForTimeout(6000)
await p.screenshot({ path: OUT + 'sports-courts.png' })
// Belgrade
await p.getByRole('button', { name: /London/ }).first().click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: /Beograd|Belgrade/ }).first().click(); await p.waitForTimeout(9000)
await tabs.getByRole('tab', { name: /^Sports/i }).click(); await p.waitForTimeout(2500)
R.bgdGames = await rail.locator('li', { hasText: /🏟/ }).count()
R.bgdVenues = (await rail.innerText()).match(/Rajko|Partizan|Arena|arena/g)?.length ?? 0
await p.evaluate(() => window.__map.jumpTo({ center: [20.4646, 44.7830], zoom: 15.2, pitch: 58, bearing: -20 })); await p.waitForTimeout(6000)
await p.screenshot({ path: OUT + 'sports-bgd.png' })
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(4000)
const mt = m.getByRole('tablist', { name: 'Show on map' })
const box = await mt.boundingBox()
await mt.getByRole('tab', { name: /^Sports/i }).click(); await m.waitForTimeout(3000)
await m.screenshot({ path: OUT + 'sports-iphone.png' })
console.log('iphone tabs fit', box && box.x >= 0 && box.x + box.width <= 393, 'width', box?.width, 'errs', JSON.stringify(errs))
await w.close()
