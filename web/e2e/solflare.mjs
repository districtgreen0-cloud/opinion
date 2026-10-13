// Solflare wallet connect: no extension → install + demo; with extension → connect → pill; iPhone → "Open in Solflare". Usage: node e2e/solflare.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const fakeSolflare = () => { window.solflare = { isSolflare: true, publicKey: null, connect: async () => { window.solflare.publicKey = { toString: () => 'SoLF1areDemoKey9xQm4tVb2Hn7Rk3Wd8Ycz5Lp6Jf1Ae' } }, disconnect: async () => { window.solflare.publicKey = null } } }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
// 1) no extension
let p = await (await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2000)
await p.getByRole('button', { name: 'Sign in or sign up' }).click(); await p.waitForTimeout(600)
R.btnNoExt = (await p.getByRole('button', { name: /Solflare/ }).first().innerText()).trim()
await p.getByRole('dialog').screenshot({ path: OUT + 'solflare-modal.png' })
await p.getByRole('button', { name: /Solflare/ }).first().click(); await p.waitForTimeout(500)
R.step = (await p.getByRole('dialog').locator('h2').innerText()).trim()
R.getLink = await p.getByRole('link', { name: /Get Solflare/ }).getAttribute('href')
await p.getByRole('dialog').screenshot({ path: OUT + 'solflare-install.png' })
await p.context().close()
// 2) with extension
p = await (await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init); await p.addInitScript(fakeSolflare)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2000)
await p.getByRole('button', { name: 'Sign in or sign up' }).click(); await p.waitForTimeout(600)
R.btnExt = (await p.getByRole('button', { name: /Solflare/ }).first().innerText()).trim()
await p.getByRole('button', { name: /Connect Solflare/ }).click(); await p.waitForTimeout(800)
R.pill = (await p.getByRole('button', { name: /SoLF|Disconnect/ }).first().innerText().catch(() => '')).replace(/\n/g, ' ')
R.pillIcon = await p.locator('img[alt="Solflare"]').count()
await p.screenshot({ path: OUT + 'solflare-pill.png', clip: { x: 760, y: 0, width: 520, height: 80 } })
await b.close()
// 3) iPhone
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.addInitScript(init)
await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(2500)
await m.getByRole('button', { name: 'Sign in or sign up' }).click(); await m.waitForTimeout(700)
R.btnPhone = (await m.getByRole('button', { name: /Solflare/ }).first().innerText()).trim()
await m.screenshot({ path: OUT + 'solflare-iphone.png' })
await w.close()
console.log(JSON.stringify({ R, errs }, null, 1))
