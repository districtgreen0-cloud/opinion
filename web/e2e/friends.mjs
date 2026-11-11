// Two real accounts in two browsers: A sends a request → B receives it (badge + list) → accepts → both are friends → B removes → gone for A.
import { chromium } from 'playwright-core'
const URL_ = 'http://localhost:4701', API = 'http://localhost:8787'
const errs = [], R = {}
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const open = async (name) => {
  const c = await b.newContext({ viewport: { width: 1300, height: 850 } })
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message))
  await p.addInitScript(() => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:entered', '1') })
  await p.goto(URL_); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 })
  const handle = await p.evaluate(async (n) => {
    const j = (u, body) => fetch('http://localhost:8787' + u, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    const e = `${n}${Date.now()}@example.com`
    const s = await j('/api/auth/email/start', { email: e, intent: 'signup' })
    return (await j('/api/auth/email/verify', { email: e, code: s.devCode })).account.handle
  }, name)
  await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
  return { p, handle }
}
const A = await open('anna'), B = await open('boris')
// B posts so A can find them on the map feed; A opens B's profile card through the store (same as tapping the avatar)
const card = (pg, h) => pg.evaluate((h) => window.__store.getState().openProfile({ handle: h, avatar: 'av:1', x: 600, y: 300 }), h)
R.hasStore = await A.p.evaluate(() => !!window.__store)
await card(A.p, B.handle); await A.p.waitForTimeout(500)
await A.p.getByRole('button', { name: '+ Add friend' }).click(); await A.p.waitForTimeout(1500)
R.aAfterSend = await A.p.getByRole('button', { name: /Requested/ }).count()
// B: no reload, wait for the poll (tab focus triggers it too)
await B.p.evaluate(() => window.__store.getState().loadFriends()); await B.p.waitForTimeout(1200)
R.bBadge = await B.p.getByRole('button', { name: /friend request/ }).count()
R.bToast = await B.p.getByText(/sent you a friend request/).count()
await B.p.getByRole('button', { name: /^Account/ }).click(); await B.p.waitForTimeout(900)
R.bList = await B.p.getByRole('list', { name: 'Friend requests' }).innerText().catch((e) => String(e).slice(0, 60))
await B.p.screenshot({ path: new URL('./shots/friends-incoming.png', import.meta.url).pathname })
await B.p.getByRole('list', { name: 'Friend requests' }).getByRole('button', { name: 'Accept' }).click(); await B.p.waitForTimeout(1500)
R.bFriends = await B.p.evaluate(() => Object.entries(window.__store.getState().friendLinks).map(([h, l]) => l.status))
await A.p.evaluate(() => window.__store.getState().loadFriends()); await A.p.waitForTimeout(1200)
R.aFriends = await A.p.evaluate(() => Object.values(window.__store.getState().friendLinks).map((l) => l.status))
R.aCard = await A.p.getByRole('button', { name: 'Message' }).count()
// fake handle → clear message, no phantom request
await card(A.p, '@nobody_here_x'); await A.p.waitForTimeout(400)
await A.p.getByRole('button', { name: '+ Add friend' }).click(); await A.p.waitForTimeout(1200)
R.noAccount = await A.p.getByText(/has no account yet/).count()
// B unfriends → A loses it
await B.p.evaluate((h) => window.__store.getState().removeFriend(h), A.handle); await B.p.waitForTimeout(1000)
await A.p.evaluate(() => window.__store.getState().loadFriends()); await A.p.waitForTimeout(1000)
R.aAfterRemove = await A.p.evaluate(() => Object.keys(window.__store.getState().friendLinks).length)
// both ask each other → instant friends
await A.p.evaluate((h) => window.__store.getState().addFriend(h, 'av:1'), B.handle); await A.p.waitForTimeout(800)
await B.p.evaluate((h) => window.__store.getState().addFriend(h, 'av:1'), A.handle); await B.p.waitForTimeout(1000)
R.mutual = await B.p.evaluate(() => Object.values(window.__store.getState().friendLinks).map((l) => l.status))
R.anon = await fetch(API + '/api/friends').then((r) => r.status)
console.log(JSON.stringify({ R, errs }, null, 1)); await b.close()
