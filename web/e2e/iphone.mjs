// iPhone (WebKit engine) smoke test against a URL. Usage: node e2e/iphone.mjs [url]
import { webkit, devices } from 'playwright-core'
const URL_ = process.argv[2] ?? 'https://opinion-london.calderabalkan.workers.dev'
const OUT = new URL('./shots/', import.meta.url).pathname
const b = await webkit.launch()
const ctx = await b.newContext({ ...devices['iPhone 15'] })
const p = await ctx.newPage()
const logs = []
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')))
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.type() + ' ' + m.text().slice(0, 220)))
p.on('requestfailed', (r) => logs.push('REQFAIL ' + r.url().slice(0, 100) + ' ' + r.failure()?.errorText))
await p.goto(URL_, { waitUntil: 'load' })
await p.waitForTimeout(4000)
await p.screenshot({ path: OUT + 'iphone-4s.png' })
const state = await p.evaluate(() => ({
  root: document.getElementById('root')?.innerHTML.length ?? -1,
  map: !!window.__map,
  loaded: window.__map?.loaded?.() ?? null,
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
  ua: navigator.userAgent.slice(0, 80),
}))
await p.waitForTimeout(8000)
await p.screenshot({ path: OUT + 'iphone-12s.png' })
state.loadedLater = await p.evaluate(() => window.__map?.loaded?.() ?? null)
console.log(JSON.stringify({ state, logs: logs.slice(0, 25) }, null, 1))
await b.close()
