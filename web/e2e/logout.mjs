// Account: log in (wallet / Google demo) → Log out → Log back in. Usage: node e2e/logout.mjs [url]
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const init = () => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(init)
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
// wallet login
await p.getByRole('button', { name: 'Sign in or sign up' }).click(); await p.waitForTimeout(500)
await p.getByRole('button', { name: /Connect wallet/ }).click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Use a demo wallet' }).click(); await p.waitForTimeout(700)
await p.getByRole('button', { name: 'Account' }).click(); await p.waitForTimeout(900)
const panel = p.locator('section').first()
R.walletCard = (await panel.getByText(/Logged in/).first().innerText()).trim()
R.logoutButtons = await panel.getByRole('button', { name: 'Log out' }).count()
await p.screenshot({ path: OUT + 'logout-wallet.png' })
await panel.getByRole('button', { name: 'Log out' }).last().click(); await p.waitForTimeout(700)
R.afterLogout = [await panel.getByRole('button', { name: 'Sign in / Sign up' }).count(), await panel.getByRole('button', { name: 'Log in / Sign up' }).count(), await p.getByRole('button', { name: 'Sign in or sign up' }).count()]
await p.screenshot({ path: OUT + 'logout-out.png' })
// log back in with Google (demo)
await panel.getByRole('button', { name: 'Log in / Sign up' }).click(); await p.waitForTimeout(500)
await p.getByRole('button', { name: /Sign in with Google/ }).click(); await p.waitForTimeout(400)
await p.getByLabel('Google account email').fill('legend@gmail.com'); await p.getByRole('button', { name: 'Continue', exact: true }).click(); await p.waitForTimeout(800)
await p.getByRole('button', { name: 'Account' }).click().catch(() => {}); await p.waitForTimeout(800)
R.backIn = (await p.locator('section').first().getByText(/Logged in/).first().innerText().catch(() => '')).trim()
R.email = await p.locator('section').first().getByText('legend@gmail.com').count()
await p.locator('section').first().getByRole('button', { name: 'Log out' }).first().click(); await p.waitForTimeout(600)
R.loggedOutAgain = await p.evaluate(() => localStorage.getItem('opinion:account'))
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
