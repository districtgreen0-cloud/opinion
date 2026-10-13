import { webkit, devices } from 'playwright-core'
const b = await webkit.launch()
// 1) normal load: guard must stay hidden
let p = await (await b.newContext({ ...devices['iPhone 15'] })).newPage()
await p.goto('http://localhost:4701'); await p.waitForTimeout(11000)
const hiddenOnSuccess = (await p.locator('#boot-guard').count()) === 0
// 2) simulate a broken bundle: block the main JS → guard must appear with details
p = await (await b.newContext({ ...devices['iPhone 15'] })).newPage()
await p.route(/assets\/index-.*\.js/, (r) => r.abort())
await p.goto('http://localhost:4701'); await p.waitForTimeout(10500)
const inlineGuard = (await p.locator('#boot-guard').count())
console.log(JSON.stringify({ hiddenOnSuccess, guardWhenMainBundleBlocked: inlineGuard }))
await b.close()
