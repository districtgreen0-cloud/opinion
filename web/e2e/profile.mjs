// Profiles: tap an avatar in the feed / a hex → small profile card → add friend → accepted → in Account. Usage: node e2e/profile.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(5000)
const first = p.locator('aside [aria-label$="profile"]').first()
R.who = (await first.getAttribute('aria-label')).replace("View ", '').replace("'s profile", '')
await first.click(); await p.waitForTimeout(600)
const card = p.getByRole('dialog', { name: /profile$/ })
R.cardBox = await card.boundingBox()
R.card = (await card.innerText()).replace(/\n/g, ' | ').slice(0, 160)
await p.screenshot({ path: OUT + 'profile-1.png' })
await card.getByRole('button', { name: '+ Add friend' }).click(); await p.waitForTimeout(300)
R.pending = await card.getByRole('button', { name: /Requested/ }).count()
await p.waitForTimeout(4500)
R.friends = await card.getByRole('button', { name: /from friends/ }).count()
await p.screenshot({ path: OUT + 'profile-2-friends.png' })
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
R.closed = await card.count()
// account panel list
await p.getByRole('button', { name: /^Y$|account/i }).last().click().catch(() => {})
await p.waitForTimeout(800)
R.account = (await p.locator('section').first().innerText().catch(() => '')).match(/Friends\s*\d+/)?.[0]
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(6000)
// open a hex with posts via a bubble
const bubble = m.locator('.bubble').first()
await bubble.click(); await m.waitForTimeout(700)
const mc = m.getByRole('dialog', { name: /profile$/ })
console.log('iphone card', JSON.stringify(await mc.boundingBox()), 'errs', JSON.stringify(errs))
await m.screenshot({ path: OUT + 'profile-iphone.png' })
await w.close()
