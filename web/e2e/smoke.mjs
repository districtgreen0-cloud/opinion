// Whole-app smoke test (demo build, no backend): every main function once. Usage: node e2e/smoke.mjs [url]
import { chromium } from 'playwright-core'
const URL_ = process.argv[2] ?? 'http://localhost:4702'
const errs = [], R = {}, fails = []
const ok = (k, v) => { R[k] = v; if (!v) fails.push(k) }
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 51.5108, longitude: -0.1172 }, permissions: ['geolocation', 'camera'] })
const p = await ctx.newPage()
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::|favicon|tiles|photon/i.test(m.text()) && errs.push('console: ' + m.text().slice(0, 160)))
await p.addInitScript(() => { if (!sessionStorage.getItem('opinion:splash')) { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:entered', '1') } })
await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3500)
const st = () => p.evaluate(() => { const s = window.__store.getState(); return { tab: s.tab, cell: s.selectedCell, account: s.account?.handle ?? null, pos: !!s.pos } })
const step = async (name, fn) => { try { await fn() } catch (e) { fails.push(name + ' ✗ ' + String(e.message).split('\n')[0].slice(0, 160)) } }
const dock = (n) => p.locator('nav').getByText(n, { exact: true }).click()
const T = { timeout: 8000 }

await step('location', async () => {
  await p.getByRole('button', { name: 'Turn on location' }).click(T); await p.waitForTimeout(3000)
  ok('locationOn', (await st()).pos); ok('youMark', (await p.locator('.you-mark').count()) === 1)
})
await step('hex', async () => {
  await p.evaluate(() => window.__map.jumpTo({ center: [-0.1172, 51.5108], zoom: 17, pitch: 0, bearing: 0 })); await p.waitForTimeout(1200)
  const [x, y] = await p.evaluate(() => { const q = window.__map.project([-0.1172, 51.5108]); return [q.x, q.y] })
  await p.mouse.click(x, y); await p.waitForTimeout(900)
  ok('hexOpens', !!(await st()).cell)
})
const sheet = p.locator('section').first()
await step('note', async () => {
  await sheet.getByRole('tab', { name: /^Notes/ }).click(T)
  await sheet.getByRole('textbox', { name: 'Comment' }).fill('smoke test note from the corner', T)
  await sheet.getByRole('button', { name: 'Drop', exact: true }).click(T); await p.waitForTimeout(700)
  ok('notePosted', (await sheet.getByText('smoke test note from the corner').count()) > 0)
})
await step('opinion', async () => {
  await sheet.getByRole('tab', { name: /^OPINION/ }).click(T)
  await sheet.getByRole('textbox', { name: 'Title' }).fill('Smoke test OPINION headline', T)
  await sheet.getByRole('button', { name: 'Post', exact: true }).click(T); await p.waitForTimeout(700)
  ok('opinionPosted', (await sheet.getByText('Smoke test OPINION headline').count()) > 0)
  await sheet.getByText('Smoke test OPINION headline').first().click(T); await p.waitForTimeout(400)
  await sheet.getByRole('textbox', { name: 'Reply' }).fill('a reply to it', T)
  await sheet.getByRole('button', { name: 'Reply', exact: true }).click(T); await p.waitForTimeout(600)
  ok('replyPosted', (await sheet.getByText('a reply to it').count()) > 0)
  await sheet.getByRole('button', { name: /All OPINIONS/ }).click(T)
})
await step('job', async () => {
  await sheet.getByRole('tab', { name: /^Jobs/ }).click(T)
  await sheet.getByRole('textbox', { name: 'Title' }).fill('Carry a box', T)
  ok('jobFormShown', (await sheet.getByRole('button', { name: /wallet|Post job/ }).count()) > 0)
})
await step('memory', async () => {
  await sheet.getByRole('tab', { name: /^Memories/ }).click(T)
  await sheet.getByRole('button', { name: 'Capture a memory' }).click(T)
  const cam = p.getByRole('dialog', { name: 'Capture a memory' })
  await cam.getByRole('button', { name: 'Take photo' }).and(p.locator(':enabled')).waitFor({ timeout: 20000 })
  await cam.getByRole('button', { name: 'Take photo' }).click(T); await p.waitForTimeout(700)
  await cam.getByRole('button', { name: 'Save' }).click(T); await p.waitForTimeout(1200)
  ok('memorySaved', (await sheet.getByRole('button', { name: /You saved a memory here/ }).count()) > 0)
})
await step('feedFilters', async () => {
  await p.keyboard.press('Escape'); await p.evaluate(() => window.__store.getState().selectCell(null)); await p.waitForTimeout(300)
  for (const t of [/^Events/i, /^Sports/i, /^Opinion/i, /^Notes/i, /^Jobs/i, /^All/i]) { await p.getByRole('tab', { name: t }).first().click(T); await p.waitForTimeout(350) }
  ok('filters', true)
})
await step('profile', async () => {
  await p.locator('aside [aria-label$="profile"]').first().click(T); await p.waitForTimeout(600)
  const card = p.getByRole('dialog', { name: /profile$/ })
  await card.getByRole('button', { name: '+ Add friend' }).click(T); await p.waitForTimeout(5000)
  ok('demoFriendAccepted', (await card.getByRole('button', { name: /from friends/ }).count()) === 1)
  await p.keyboard.press('Escape')
})
await step('tabs', async () => {
  await dock('Events'); await p.waitForTimeout(900); ok('eventsPanel', (await st()).tab === 'events' && (await sheet.innerText()).length > 80)
  await dock('Crews'); await p.waitForTimeout(900); ok('crewsPanel', (await st()).tab === 'crews')
  await dock('Market'); await p.waitForTimeout(1200); ok('marketPanel', (await st()).tab === 'market' && (await sheet.innerText()).length > 80)
  await dock('ZK Chat'); await p.waitForTimeout(1500); ok('chatPanel', (await st()).tab === 'chat')
  await dock('Rewards'); await p.waitForTimeout(500); ok('rewardsLocked', (await st()).tab === 'chat' && (await p.getByText('Coming soon').count()) > 0)
  await dock('Explore'); await p.waitForTimeout(500); ok('backToExplore', (await st()).tab === 'explore')
})
await step('auth', async () => {
  await p.getByRole('button', { name: 'Sign in or sign up' }).click(T); await p.waitForTimeout(500)
  const m = p.getByRole('dialog', { name: /Sign in or sign up/ })
  ok('authOptions', (await m.getByRole('button', { name: /Solflare/ }).count()) > 0 && (await m.getByRole('button', { name: /Google/ }).count()) > 0)
  await m.getByRole('tab', { name: 'Sign up' }).click(T)
  await m.getByRole('textbox', { name: 'Email' }).fill('smoke@example.com', T)
  await m.getByRole('button', { name: /with email/ }).click(T); await p.waitForTimeout(1200)
  const code = (await m.locator('text=/Your code:/').innerText(T)).match(/\d{6}/)[0]
  await m.getByRole('textbox', { name: 'Digit 1' }).click(T); await p.keyboard.type(code); await p.waitForTimeout(1800)
  ok('signedUp', !!(await st()).account)
})
await step('account', async () => {
  await p.getByRole('button', { name: /^Account/ }).click(T); await p.waitForTimeout(900)
  const txt = await sheet.innerText()
  ok('accountPanel', txt.includes('Friends')); ok('friendListed', /Friends\s*1/i.test(txt))
  const out = p.getByRole('button', { name: /Log out/ }).first()
  await out.click(T); await p.waitForTimeout(300); await p.getByRole('button', { name: /Log out|Tap again|Confirm/ }).first().click(T).catch(() => {}); await p.waitForTimeout(1200)
  ok('loggedOut', !(await st()).account)
})
await step('world', async () => {
  await p.evaluate(() => { const s = window.__store.getState(); s.setTab('explore'); s.goWorld() }); await p.waitForTimeout(5500)
  ok('worldView', await p.evaluate(() => window.__map.getZoom() < 4))
  await p.getByRole('textbox', { name: 'Search any city' }).fill('Tok', T); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /Tokyo/ }).first().click(T); await p.waitForTimeout(8000)
  ok('cityFlyIn', await p.evaluate(() => Math.abs(window.__map.getCenter().lng - 139.7) < 0.5 && window.__map.getZoom() > 14))
})
await step('reload', async () => { await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500); ok('survivesReload', (await p.locator('nav').count()) > 0) })
console.log(JSON.stringify({ R, fails, errs: [...new Set(errs)] }, null, 1)); await b.close()
