// Username save + delete own posts / photo, live backend, two accounts. Usage: node e2e/rename-delete.mjs
import { chromium } from 'playwright-core'
const API = 'http://localhost:8787', errs = [], R = {}
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const open = async (name) => {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 51.4995, longitude: -0.1248 }, permissions: ['geolocation', 'camera'] })
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('dialog', (d) => d.accept())
  await p.addInitScript(() => { sessionStorage.setItem('opinion:splash', '1'); sessionStorage.setItem('opinion:entered', '1'); localStorage.setItem('opinion:entered', '1') })
  await p.goto('http://localhost:4701'); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 })
  const handle = await p.evaluate(async (n) => {
    const j = (u, body) => fetch('http://localhost:8787' + u, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    const e = `${n}${Date.now()}@example.com`
    const s = await j('/api/auth/email/start', { email: e, intent: 'signup' })
    const a = (await j('/api/auth/email/verify', { email: e, code: s.devCode })).account
    await j('/api/opinion', { text: 'first opinion so normal posting is unlocked', cell: '8a194ad3246ffff' })
    return a.handle
  }, name)
  await p.reload(); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(2500)
  return { p, handle }
}
const A = await open('rita'), B = await open('sam')
const sheet = A.p.locator('section').first()
const tag = Date.now().toString(36).slice(-5)
// ── posts in A's hex (before renaming, so we can see the name follow)
await A.p.getByRole('button', { name: 'Turn on location' }).click(); await A.p.waitForTimeout(3000)
await A.p.evaluate(() => window.__map.jumpTo({ center: [-0.1248, 51.4995], zoom: 17, pitch: 0, bearing: 0 })); await A.p.waitForTimeout(1200)
const [x, y] = await A.p.evaluate(() => { const q = window.__map.project([-0.1248, 51.4995]); return [q.x, q.y] })
await A.p.mouse.click(x, y); await A.p.waitForTimeout(900)
const cell = await A.p.evaluate(() => window.__store.getState().selectedCell)
await sheet.getByRole('tab', { name: /^Notes/ }).click()
await sheet.getByRole('textbox', { name: 'Comment' }).fill('note to delete ' + tag); await sheet.getByRole('button', { name: 'Drop', exact: true }).click(); await A.p.waitForTimeout(1200)
await sheet.getByRole('tab', { name: /^OPINION/ }).click()
await sheet.getByRole('textbox', { name: 'Title' }).fill('opinion to delete ' + tag); await sheet.getByRole('button', { name: 'Post', exact: true }).click(); await A.p.waitForTimeout(1200)
await sheet.getByText('opinion to delete ' + tag).first().click(); await A.p.waitForTimeout(400)
await sheet.getByRole('textbox', { name: 'Reply' }).fill('reply under it ' + tag); await sheet.getByRole('button', { name: 'Reply', exact: true }).click(); await A.p.waitForTimeout(1200)
await sheet.getByRole('button', { name: /All OPINIONS/ }).click()
await sheet.getByRole('tab', { name: /^Memories/ }).click()
await sheet.getByRole('button', { name: 'Capture a memory' }).click()
const cam = A.p.getByRole('dialog', { name: 'Capture a memory' })
await cam.getByRole('button', { name: 'Take photo' }).and(A.p.locator(':enabled')).waitFor({ timeout: 20000 }); await cam.getByRole('button', { name: 'Take photo' }).click(); await A.p.waitForTimeout(700)
await cam.getByRole('button', { name: 'Save' }).click(); await A.p.waitForTimeout(2500)
const server = async () => { const j = await (await fetch(`${API}/api/hex/${cell}/comments`)).json(); const m = await (await fetch(`${API}/api/memories?cell=${cell}`)).json(); return { posts: j.comments.filter((c) => (c.title ?? c.text).includes(tag)), mem: m.memories.length } }
let sv = await server(); R.posted = sv.posts.length + ' posts, ' + sv.mem + ' photo'
const noteId = sv.posts.find((c) => c.text.startsWith('note to delete')).id
// ── username
await A.p.getByRole('button', { name: /^Account/ }).click(); await A.p.waitForTimeout(900)
const field = A.p.locator('#handle'), save = A.p.getByRole('button', { name: 'Save', exact: true })
R.saveDisabledUnchanged = await save.isDisabled()
await field.fill(B.handle.slice(1)); await save.click(); await A.p.waitForTimeout(1200)
R.takenMsg = await A.p.getByText('That username is taken').count()
const fresh = 'rita.new_' + tag
await field.fill(fresh); await save.click(); await A.p.waitForTimeout(1500)
R.savedMsg = await A.p.getByText('Saved ✓').count()
await A.p.reload(); await A.p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await A.p.waitForTimeout(2500)
R.afterReload = await A.p.evaluate(() => [window.__store.getState().account.handle, window.__store.getState().me.handle].join(' '))
await A.p.waitForTimeout(1500)
sv = await server(); R.oldPostsRenamed = sv.posts.every((c) => c.handle === '@' + fresh)
R.chatKeyRenamed = await fetch(`${API}/api/zk/keys?handle=${encodeURIComponent('@' + fresh)}`).then((r) => r.status)
R.oldNameFree = await fetch(`${API}/api/zk/keys?handle=${encodeURIComponent(A.handle)}`).then((r) => r.status)
// ── B can't delete A's note
R.otherCannotDelete = await B.p.evaluate(([c, id]) => fetch(`http://localhost:8787/api/hex/${c}/comments/${id}/delete`, { method: 'POST', credentials: 'include' }).then((r) => r.status), [cell, noteId])
R.anonCannotDelete = await fetch(`${API}/api/hex/${cell}/comments/${noteId}/delete`, { method: 'POST' }).then((r) => r.status)
// B is looking at the same hex
await B.p.evaluate((c) => window.__store.getState().selectCell(c), cell); await B.p.waitForTimeout(1500)
R.bHasNoDeleteButton = await B.p.locator('section').first().getByRole('button', { name: /^Delete/ }).count()
// ── A deletes: note, then the OPINION (reply goes with it), then the photo
await A.p.evaluate((c) => window.__store.getState().selectCell(c), cell); await A.p.waitForTimeout(1500)
await sheet.getByRole('tab', { name: /^Notes/ }).click(); await A.p.waitForTimeout(400)
await sheet.locator('li', { hasText: 'note to delete ' + tag }).getByRole('button', { name: 'Delete' }).click(); await A.p.waitForTimeout(1200)
R.noteGoneForA = (await sheet.getByText('note to delete ' + tag).count()) === 0
await sheet.getByRole('tab', { name: /^OPINION/ }).click(); await sheet.getByText('opinion to delete ' + tag).first().click(); await A.p.waitForTimeout(400)
await sheet.getByRole('button', { name: 'Delete this OPINION' }).click(); await A.p.waitForTimeout(1200)
await sheet.getByRole('tab', { name: /^Memories/ }).click(); await A.p.waitForTimeout(600)
await sheet.getByRole('button', { name: /^Memory by/ }).first().click(); await A.p.waitForTimeout(500)
await A.p.getByRole('button', { name: 'Delete my photo' }).click(); await A.p.waitForTimeout(1800)
sv = await server(); R.serverAfterDelete = sv.posts.length + ' posts, ' + sv.mem + ' photo'
R.bSawLiveRemoval = await B.p.evaluate((t) => !window.__store.getState().comments.some((c) => (c.title ?? c.text).includes(t)), tag)
R.canCaptureAgain = await sheet.getByRole('button', { name: 'Capture a memory' }).count()
const T = process.env.TOKEN; const tr = await (await fetch(API + '/api/draw/admin/tracker', { headers: { Authorization: 'Bearer ' + T } })).json()
R.trackerCleared = !tr.posts.some((x) => ((x.title ?? '') + x.text).includes(tag))
console.log(JSON.stringify({ R, errs }, null, 1)); await b.close()
