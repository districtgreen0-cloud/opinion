// Compass: 47% smaller; red off-hex, purple on an active hex. Usage: node e2e/compass2.mjs [url]
import { chromium } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const OUT = new URL('./shots/', import.meta.url).pathname
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const out = {}
for (const [name, ll] of [['quiet', [51.4700, -0.0300]], ['busy', [51.5108, -0.1172]]]) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2, geolocation: { latitude: ll[0], longitude: ll[1] }, permissions: ['geolocation'] })
  const p = await ctx.newPage()
  await p.addInitScript(() => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1') })
  await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
  await p.getByRole('button', { name: 'Turn on location' }).click(); await p.waitForTimeout(2500)
  await p.evaluate((c) => window.__map.jumpTo({ center: [c[1], c[0]], zoom: 17.6, pitch: 45, bearing: 0 }), ll); await p.waitForTimeout(3500)
  const shot = await p.screenshot({ path: OUT + `compass2-${name}.png`, clip: { x: 350, y: 200, width: 300, height: 300 } })
  out[name] = shot.length
  await ctx.close()
}
console.log(JSON.stringify(out))
await b.close()
