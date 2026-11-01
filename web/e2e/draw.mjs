// Hex lottery: pill → sign up → registration OPINION + X handle → "You're in" → after reveal: winner + verify. Usage: node e2e/draw.mjs [webUrl] [apiUrl]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701', API = process.argv[3] ?? 'http://localhost:8787'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const HOME = { latitude: 51.5108, longitude: -0.1172 }
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const TOKEN = process.env.TOKEN
const adm = (p, body) => fetch(API + p, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then((r) => r.json())
await adm('/api/draw/admin/cancel').catch(() => {}) // clear any leftover undrawn draw
R.create = await adm('/api/draw/admin/create', { title: 'Launch week draw', prize: '1 crypto card', xAccount: 'useopinion', startsAt: Date.now(), endsAt: Date.now() + 150_000 })
const endsAt = Date.now() + 150_000
R.commit = (await adm('/api/draw/admin/commit')).commitHash?.slice(0, 12)
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, geolocation: HOME, permissions: ['geolocation'] })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
R.pill = (await p.getByRole('button', { name: /Hex lottery/ }).innerText()).trim()
await p.getByRole('button', { name: /Hex lottery/ }).click(); await p.waitForTimeout(800)
await p.screenshot({ path: OUT + 'draw-1-steps.png' })
// step 1: sign up by email code (dev worker returns the code)
await p.getByRole('button', { name: 'Sign in / Sign up' }).click(); await p.waitForTimeout(600)
await p.getByRole('tab', { name: 'Sign up' }).click().catch(() => {})
const email = `draw+${Date.now().toString(36)}@example.com`
await p.getByRole('textbox', { name: 'Email' }).fill(email)
await p.getByRole('button', { name: /with email/ }).click(); await p.waitForTimeout(1500)
// dev worker: the modal shows the code on screen (DEV_RETURN_CODES=1)
const devCode = (await p.locator('text=/Your code:/').innerText()).match(/\d{6}/)[0]
await p.getByRole('textbox', { name: 'Digit 1' }).click(); await p.keyboard.type(devCode); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Verify', exact: true }).click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(2500) // the 6th digit may auto-verify
// registration: tap a hex, leave the OPINION, then the ticket window takes the X handle
await p.mouse.click(500, 700); await p.waitForTimeout(900)
const gate = p.getByRole('dialog', { name: 'Leave your OPINION' })
await gate.getByRole('textbox', { name: 'Your OPINION' }).fill('the coffee at the corner is honestly underrated')
await gate.getByRole('button', { name: 'Post my OPINION' }).click(); await p.waitForTimeout(2500)
await p.getByRole('textbox', { name: 'Your X handle' }).fill('@Tester_' + Date.now().toString(36).slice(-6))
await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(1500)
R.entered = await p.locator('text=You’re in').count()
await p.screenshot({ path: OUT + 'draw-3-entered.png' })
await p.keyboard.press('Escape')
console.log(JSON.stringify({ R, errs }))
// wait for the window to close, reveal, reload → winner view
await p.waitForTimeout(Math.max(0, endsAt - Date.now() + 2000))
const rv = await adm('/api/draw/admin/reveal')
await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
await p.getByRole('button', { name: /Hex lottery/ }).click(); await p.waitForTimeout(800)
R.winner = (await p.locator('text=/You won|Winner/').first().innerText()).trim()
await p.getByRole('button', { name: 'Verify this draw' }).click(); await p.waitForTimeout(400)
R.verifyRows = await p.locator('text=/commit|seed|anchor|entries root|winner/').count()
await p.screenshot({ path: OUT + 'draw-4-winner.png' })
await p.getByRole('button', { name: 'Show the winning hex →' }).click(); await p.waitForTimeout(2500)
await p.screenshot({ path: OUT + 'draw-5-hex.png' })
console.log(JSON.stringify({ reveal: rv.winnerXHandle, winner: R.winner, verifyRows: R.verifyRows, errs }))
await b.close()
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(2500)
await m.getByRole('button', { name: /Hex lottery/ }).click(); await m.waitForTimeout(800)
await m.screenshot({ path: OUT + 'draw-iphone.png' })
console.log('iphone errs', JSON.stringify(errs))
await w.close()
