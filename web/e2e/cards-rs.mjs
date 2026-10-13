import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4701'); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(8000)
await p.getByRole('button', { name: 'Crypto cards available here' }).click({ timeout: 90000 }); await p.waitForTimeout(800)
const panel = p.locator('section').first()
const R = {}
for (const c of ['United Kingdom', 'United States', 'Serbia']) {
  await panel.getByRole('button', { name: c, exact: true }).click(); await p.waitForTimeout(300)
  const t = await panel.innerText()
  R[c] = { confirmed: t.match(new RegExp(c + ' · (\\d+)'))?.[1], check: (t.match(/CHECK ELIGIBILITY/g) || []).length, rows: await panel.locator('ul').first().locator('> li').count(), notHere: t.match(/(\d+) not available in/)?.[1] ?? '0', holyheld: t.includes('Holyheld') }
}
await p.screenshot({ path: new URL('./shots/cards-rs.png', import.meta.url).pathname })
console.log(JSON.stringify({ R, errs }, null, 1)); await b.close()
