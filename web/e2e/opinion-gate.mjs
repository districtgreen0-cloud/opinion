// Registration gate: sign up → cannot dismiss → OPINION + X handle → entered in the draw, opinion appears in the city hex. Usage: TOKEN=… node e2e/opinion-gate.mjs
import { chromium } from 'playwright-core'
const URL_ = 'http://localhost:4701', API = 'http://localhost:8787', TOKEN = process.env.TOKEN
const OUT = new URL('./shots/', import.meta.url).pathname
const adm = (p, b) => fetch(API + p, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then((r) => r.json())
await adm('/api/draw/admin/cancel').catch(() => {})
await adm('/api/draw/admin/create', { title: 'Win a Breakpoint ticket', prize: '1 General Admission ticket to Solana Breakpoint, London, 15–17 Nov', xAccount: 'useopinion', startsAt: Date.now(), endsAt: Date.now() + 3600e3 })
const errs = [], R = {}
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(() => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') })
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
R.pill = (await p.getByRole('button', { name: /Hex lottery/ }).innerText()).trim()
R.tab = await p.getByRole('tab', { name: /OPINION/ }).count()
await p.getByRole('button', { name: /Hex lottery/ }).click(); await p.waitForTimeout(700)
await p.getByRole('button', { name: 'Sign in / Sign up' }).click(); await p.waitForTimeout(500)
await p.getByRole('tab', { name: 'Sign up' }).click()
R.blurb = await p.locator('text=/leave your OPINION to enter/').count()
await p.getByRole('textbox', { name: 'Email' }).fill(`gate+${Date.now().toString(36)}@example.com`)
await p.getByRole('button', { name: /with email/ }).click(); await p.waitForTimeout(1500)
const code = (await p.locator('text=/Your code:/').innerText()).match(/\d{6}/)[0]
await p.getByRole('textbox', { name: 'Digit 1' }).click(); await p.keyboard.type(code); await p.waitForTimeout(2500)
const gate = p.getByRole('dialog', { name: 'Leave your OPINION' })
R.gate = await gate.count()
await p.keyboard.press('Escape'); await p.mouse.click(10, 10); await p.waitForTimeout(400)
R.gateAfterEsc = await gate.count()
await p.screenshot({ path: OUT + 'gate-1.png' })
const go = gate.getByRole('button', { name: /Post my OPINION/ })
await gate.getByRole('textbox', { name: 'Your OPINION' }).fill('short')
await gate.getByRole('textbox', { name: 'Your X handle' }).fill('@Gate_' + Date.now().toString(36).slice(-6))
R.disabledShort = await go.isDisabled()
await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
R.gateAfterReload = await gate.count()
await gate.getByRole('textbox', { name: 'Your OPINION' }).fill('Bridges should be free to walk and full of music at every hour of the night, because a city belongs to the people who walk it, not just the ones who drive across it.')
await gate.getByRole('textbox', { name: 'Your X handle' }).fill('@Gate_' + Date.now().toString(36).slice(-6))
await go.click(); await p.waitForTimeout(2500)
R.gateGone = (await gate.count()) === 0
R.entered = await p.locator('text=You’re in').count()
await p.screenshot({ path: OUT + 'gate-2.png' })
const st = await p.evaluate(() => fetch('http://localhost:8787/api/draw', { credentials: 'include' }).then((r) => r.json()))
R.count = st.draw.entriesCount; R.me = st.me
R.hex = await fetch(API + '/api/hex-counts').then((r) => r.json())
const again = await p.evaluate(() => fetch('http://localhost:8787/api/opinion', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'a second opinion that must not post' }) }).then((r) => r.status))
R.secondCall = again
await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
R.gateAfterDone = await gate.count()
const [cell] = Object.keys(R.hex.counts)
if (cell) { R.posts = await fetch(`${API}/api/hex/${cell}/comments`).then((r) => r.json()).then((j) => (j.comments ?? []).map((c) => [c.kind, c.title?.length, c.text?.length])).catch((e) => String(e)) }
await adm('/api/draw/admin/cancel')
console.log(JSON.stringify({ R, errs }, null, 1)); await b.close()
