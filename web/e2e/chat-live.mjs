// Real chat between real accounts in separate browsers, through the relay. Usage: node e2e/chat-live.mjs
import { chromium } from 'playwright-core'
const URL_ = 'http://localhost:4701'
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
  await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(3000)
  return { p, handle, name }
}
const dock = (u, n) => u.p.locator('nav').getByText(n, { exact: true }).click()
const say = async (u, text) => { await u.p.getByRole('textbox', { name: 'Encrypted message' }).fill(text); await u.p.getByRole('button', { name: 'Send', exact: true }).click(); await u.p.waitForTimeout(900) }
const sees = (u, text) => u.p.getByText(text, { exact: true }).count()
const A = await open('ana'), B = await open('ben'), C = await open('cy')
R.keysPublished = await A.p.evaluate(async (hs) => (await Promise.all(hs.map((h) => fetch('http://localhost:8787/api/zk/keys?handle=' + encodeURIComponent(h)).then((r) => r.status)))).join(','), [A.handle, B.handle, C.handle])

// A finds B by handle and writes. B has the app open on the MAP (chat closed).
await dock(A, 'ZK Chat'); await A.p.waitForTimeout(800)
R.noDemoPeers = await A.p.getByRole('list', { name: 'Chats' }).locator('li').count()
await A.p.getByRole('button', { name: '＋ Add person' }).click()
await A.p.getByRole('textbox', { name: 'Their handle' }).fill(B.handle)
await A.p.getByRole('button', { name: 'Find', exact: true }).click(); await A.p.waitForTimeout(1200)
await A.p.getByRole('button', { name: 'Message', exact: true }).click(); await A.p.waitForTimeout(1500)
await say(A, 'hello ben, this is ana')
R.aSeesOwn = await sees(A, 'hello ben, this is ana')
// B: waits for the poll (max 20 s) → toast + badge without opening chat
await B.p.waitForFunction(() => Object.values(window.__zk.getState().unread).reduce((a, n) => a + n, 0) > 0, null, { timeout: 30000 }).catch(() => {})
R.bUnreadBadge = await B.p.locator('nav [aria-label$="unread"]').innerText().catch(() => '0')
R.bToast = await B.p.getByText(/New message from/).count()
await dock(B, 'ZK Chat'); await B.p.waitForTimeout(800)
await B.p.getByRole('list', { name: 'Chats' }).getByRole('button').first().click(); await B.p.waitForTimeout(800)
R.bReads = await sees(B, 'hello ben, this is ana')
R.bBadgeCleared = await B.p.locator('nav [aria-label$="unread"]').count()
// B replies → A gets it live over the socket (both in the room)
await say(B, 'hi ana, got it')
await A.p.waitForTimeout(1500)
R.aGetsReplyLive = await sees(A, 'hi ana, got it')
await say(A, 'second one, instant?'); await B.p.waitForTimeout(1500)
R.bGetsLive = await sees(B, 'second one, instant?')
// the relay holds ciphertext only
R.relayPlaintext = await A.p.evaluate(async () => { const z = window.__zk.getState(); const id = z.rooms[0].id; const t = await fetch(`http://localhost:8787/api/zk/rooms/${id}/messages?since=0`).then((r) => r.text()); return /hello ben|hi ana|second one/.test(t) })
// reload: history comes back and decrypts
await B.p.reload(); await B.p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await B.p.waitForTimeout(3000)
await dock(B, 'ZK Chat'); await B.p.waitForTimeout(800); await B.p.getByRole('list', { name: 'Chats' }).getByRole('button').first().click(); await B.p.waitForTimeout(800)
R.bHistoryAfterReload = (await sees(B, 'hello ben, this is ana')) + (await sees(B, 'hi ana, got it')) + (await sees(B, 'second one, instant?'))

// Group room: A adds C as a contact, creates a room with B and C
await A.p.evaluate((h) => window.__zk.getState().addByHandle(h), C.handle)
const gid = await A.p.evaluate(() => { const z = window.__zk.getState(); return z.createGroup('Launch team', z.contacts.map((c) => c.fp)) })
R.groupCreated = !!gid
await A.p.evaluate((id) => window.__zk.getState().send(id, 'welcome to the room'), gid)
await C.p.evaluate(() => window.__zk.getState().sync()); await C.p.waitForTimeout(1500)
await dock(C, 'ZK Chat'); await C.p.waitForTimeout(800)
R.cRoomListed = await C.p.getByRole('list', { name: 'Chats' }).getByText('Launch team').count()
await C.p.getByRole('list', { name: 'Chats' }).getByRole('button').first().click(); await C.p.waitForTimeout(800)
R.cReads = await sees(C, 'welcome to the room')
await say(C, 'cy here, reading fine')
await B.p.evaluate(() => window.__zk.getState().sync()); await B.p.waitForTimeout(1500)
R.bReadsGroup = await B.p.evaluate(() => Object.values(window.__zk.getState().plain).includes('cy here, reading fine'))
// remove C → key rotates → C can't read what comes next
await A.p.evaluate(([id, h]) => { const z = window.__zk.getState(); return z.removeMember(id, z.contacts.find((c) => c.handle === h).fp) }, [gid, C.handle])
await A.p.evaluate((id) => window.__zk.getState().send(id, 'after cy left'), gid); await B.p.waitForTimeout(2500)
R.bReadsAfterRotation = await B.p.evaluate(() => Object.values(window.__zk.getState().plain).includes('after cy left'))
await C.p.evaluate(() => window.__zk.getState().sync()); await C.p.waitForTimeout(1200)
R.cCannotReadNew = !(await C.p.evaluate(() => Object.values(window.__zk.getState().plain).includes('after cy left')))
// impersonation: signed-in C tries to register a key under A's handle
R.cannotStealHandle = await C.p.evaluate(async (h) => { const z = window.__zk.getState(); const r = await fetch('http://localhost:8787/api/zk/keys', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fp: z.me.fp, pub: z.me.pub, handle: h, avatar: 'av:1' }) }).then((r) => r.json()); return r.handle !== h }, A.handle)
console.log(JSON.stringify({ R, errs }, null, 1)); await b.close()
