// Sign-in flows. Usage: node e2e/auth.mjs <url> [live]   (live = real worker backend with DEV_RETURN_CODES=1)
import { chromium, webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701', LIVE = process.argv[3] === 'live'
const OUT = new URL('./shots/', import.meta.url).pathname
const R = {}, errs = []
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
R.favicon = await p.evaluate(() => fetch('/favicon.svg').then((r) => r.text()).then((t) => t.includes('#9945FF') && !t.includes('#FF5A1F')))
await p.getByRole('button', { name: 'Sign in', exact: true }).first().click(); await p.waitForTimeout(700)
await p.screenshot({ path: OUT + 'auth-start.png' })
const dlg = p.getByRole('dialog', { name: 'Sign in to OPINION' })
await dlg.getByLabel('Email').fill('not-an-email'); await dlg.getByRole('button', { name: 'Email me a code' }).click(); await p.waitForTimeout(300)
R.badEmail = (await dlg.innerText()).includes("doesn't look like an email")
const email = `tester${Date.now() % 100000}@example.org`
await dlg.getByLabel('Email').fill(email); await dlg.getByRole('button', { name: 'Email me a code' }).click(); await p.waitForTimeout(1500)
const txt = await dlg.innerText()
const code = txt.match(/Your code:\s*(\d{6})/)?.[1]
R.codeShown = !!code
const wrong = code === '000000' ? '111111' : '000000'
await dlg.getByLabel('Digit 1').fill(wrong); await p.waitForTimeout(1200)
R.wrongRejected = (await dlg.innerText()).includes('isn’t right')
await dlg.getByLabel('Digit 1').fill(code); await p.waitForTimeout(2000)
R.dialogClosed = (await p.getByRole('dialog').count()) === 0
R.signInGone = (await p.getByRole('button', { name: 'Sign in', exact: true }).count()) === 0
await p.getByRole('button', { name: 'Account' }).click(); await p.waitForTimeout(700)
const acc = await p.locator('section').first().innerText()
R.accountShows = acc.includes(email) && /SIGNED IN · EMAIL/i.test(acc)
await p.screenshot({ path: OUT + 'auth-account.png' })
if (LIVE) {
  R.cookieHttpOnly = (await ctx.cookies()).some((c) => c.name === 'op_session' && c.httpOnly)
  await p.reload(); await p.waitForTimeout(6000)
  R.sessionSurvivesReload = (await p.getByRole('button', { name: 'Sign in', exact: true }).count()) === 0
  await p.getByRole('button', { name: 'Account' }).click(); await p.waitForTimeout(700)
}
await p.locator('section').first().getByRole('button', { name: 'Sign out' }).click(); await p.waitForTimeout(1200)
R.signedOut = (await p.getByRole('button', { name: 'Sign in', exact: true }).count()) > 0
if (LIVE) R.meAfterLogout = await p.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.status))
// Google: demo = simulated chooser; live without credentials = clear error
await p.getByRole('button', { name: 'Sign in', exact: true }).first().click(); await p.waitForTimeout(600)
if (LIVE) {
  R.googleStart = await p.evaluate(() => fetch('/api/auth/google/start?redirect=/').then((r) => r.status))
} else {
  await dlg.getByRole('button', { name: 'Continue with Google' }).click(); await p.waitForTimeout(300)
  await dlg.getByLabel('Google account email').fill('maya.k@gmail.com'); await dlg.getByRole('button', { name: 'Continue' }).click(); await p.waitForTimeout(800)
  R.googleDemo = (await p.getByRole('button', { name: 'Sign in', exact: true }).count()) === 0 && (await p.evaluate(() => JSON.parse(localStorage.getItem('opinion:account') || 'null')?.providers?.[0])) === 'google'
}
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
if (!LIVE) {
  const w = await webkit.launch()
  const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
  m.on('pageerror', (e) => errs.push('iphone ' + e.message))
  await m.goto(URL_); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(3000)
  const bar = await m.evaluate(() => { const els = [...document.querySelectorAll('header, [aria-label="Sign in"], [aria-label="Account"]')]; const r = document.querySelector('[aria-label="Account"]').getBoundingClientRect(); return { accountRight: Math.round(r.right), vw: innerWidth, hscroll: document.documentElement.scrollWidth > innerWidth } })
  await m.getByRole('button', { name: 'Sign in', exact: true }).first().click(); await m.waitForTimeout(700)
  await m.screenshot({ path: OUT + 'auth-iphone.png' })
  console.log('iphone', JSON.stringify(bar), 'errs', JSON.stringify(errs))
  await w.close()
}
