// Simulates Brave on iOS with WebGL blocked (Shields / Lockdown Mode) → lite mode must render, no fatal screen.
import { webkit, devices } from 'playwright-core'
const OUT = new URL('./shots/', import.meta.url).pathname
const URL_ = process.argv[2] ?? 'http://localhost:4701'
const b = await webkit.launch()
const ctx = await b.newContext({ ...devices['iPhone 15'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1 Brave' })
await ctx.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    return /webgl/i.test(type) ? null : orig.call(this, type, ...a)
  }
})
const p = await ctx.newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto(URL_); await p.waitForTimeout(10500)
const R = {
  fatal: await p.locator('#boot-guard').count(),
  lite: (await p.locator('text=Lite mode').count()) > 0,
  braveStep: (await p.locator('text=lion icon').count()) > 0,
  events: await p.locator('h2:has-text("events") + ul > li').count(),
  feed: await p.locator('h2:has-text("Live voices") + ul > li').count(),
}
await p.screenshot({ path: OUT + 'nowebgl-iphone.png', fullPage: false })
console.log(JSON.stringify({ R, errs }))
await b.close()
