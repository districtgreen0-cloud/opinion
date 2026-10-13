// Location compass (three.js) with heading + new Log out button. Usage: node e2e/compass.mjs [url]
import { chromium } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const errs = [], R = {}
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
for (const theme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, geolocation: { latitude: 51.5126, longitude: -0.1240 }, permissions: ['geolocation'] })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript((t) => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:theme', JSON.stringify(t)) }, theme)
  await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
  await p.getByRole('button', { name: 'Turn on location' }).click(); await p.waitForTimeout(2500)
  // pretend the phone faces east-north-east
  await p.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 300, beta: 0, gamma: 0, absolute: true })))
  await p.evaluate(() => window.__map.jumpTo({ center: [-0.1240, 51.5126], zoom: 17.6, pitch: 50, bearing: 0 })); await p.waitForTimeout(3000)
  await p.screenshot({ path: OUT + `compass-${theme}.png` })
  R[theme] = await p.evaluate(() => JSON.parse(localStorage.getItem('opinion:tracking')))
  if (theme === 'dark') {
    await p.getByRole('button', { name: 'Sign in or sign up' }).click(); await p.waitForTimeout(400)
    await p.getByRole('button', { name: /Connect wallet/ }).click(); await p.waitForTimeout(300)
    await p.getByRole('button', { name: 'Use a demo wallet' }).click(); await p.waitForTimeout(500)
    await p.getByRole('button', { name: 'Account' }).click(); await p.waitForTimeout(900)
    const panel = p.locator('section').first()
    await panel.getByRole('button', { name: /^Log out/ }).last().scrollIntoViewIfNeeded()
    await p.waitForTimeout(400)
    await panel.screenshot({ path: OUT + 'logout-new.png' })
    await panel.getByRole('button', { name: /^Log out/ }).last().click(); await p.waitForTimeout(300)
    await panel.screenshot({ path: OUT + 'logout-armed.png' })
    R.armed = (await panel.getByRole('button', { name: /Tap again/ }).count())
    await panel.getByRole('button', { name: /Tap again/ }).click(); await p.waitForTimeout(600)
    R.after = await panel.getByRole('button', { name: 'Log in / Sign up' }).count()
  }
  await ctx.close()
}
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()
