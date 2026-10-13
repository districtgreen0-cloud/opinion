// ZK Chat end-to-end UI test (Chromium desktop + WebKit iPhone). Needs `npx vite preview --port 4701`.
import { chromium, webkit, devices } from 'playwright-core'
const OUT = new URL('./shots/', import.meta.url).pathname
const R = {}, errs = []
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] })).newPage()
p.on('pageerror', (e) => errs.push(e.message))
const panel = () => p.locator('section').first()
const btn = (n) => panel().getByRole('button', { name: n }).first()
await p.goto('http://localhost:4701'); await p.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await p.waitForTimeout(5000)

await p.getByRole('button', { name: 'ZK Chat', exact: true }).click()
await p.waitForSelector('text=Share invite', { timeout: 15000 }); await p.waitForTimeout(1200)
const home = await panel().innerText()
R.seededDm = home.includes('@nyx') && home.includes('end-to-end encrypted')
R.seededGroup = home.includes('Breakpoint crew') && home.includes('KEY v0')
await p.screenshot({ path: OUT + 'zk-home.png' })

// DM: send + receive an encrypted reply from the demo peer
await panel().getByRole('button', { name: /@nyx/ }).first().click(); await p.waitForTimeout(500)
await p.getByLabel('Encrypted message').fill('meet at the Olympia entrance?')
await btn('Send').click(); await p.waitForTimeout(5200)
const dm = await panel().innerText()
R.sentVisible = dm.includes('meet at the Olympia entrance?')
R.replyCount = await panel().locator('li').count()
await p.getByRole('switch', { name: 'Show ciphertext' }).click(); await p.waitForTimeout(300)
const cipher = await panel().innerText()
R.cipherHidesText = !cipher.includes('meet at the Olympia entrance?') && /iv [A-Za-z0-9_-]{16}/.test(cipher)
await p.screenshot({ path: OUT + 'zk-cipher.png' })
await p.getByRole('switch', { name: 'Show ciphertext' }).click()
await p.screenshot({ path: OUT + 'zk-dm.png' })

// storage holds ciphertext only
R.noPlaintextOnDisk = await p.evaluate(() => !Object.keys(localStorage).filter((k) => k.startsWith('opinion:zk:env')).some((k) => localStorage.getItem(k).includes('Olympia entrance')))

// add person: bad code then a real invite from a freshly generated identity
await p.locator('section button[aria-label=Close]').first().click(); await p.waitForTimeout(300)
await btn('＋ Add person').click()
await p.locator('#invite').fill('not-a-code'); await btn('Add contact').click(); await p.waitForTimeout(300)
R.badInviteRejected = (await panel().innerText()).includes("isn't a valid")
const code = await p.evaluate(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const j = await crypto.subtle.exportKey('jwk', kp.publicKey)
  const s = btoa(JSON.stringify({ h: '@carol', a: 'av:5', x: j.x, y: j.y })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'opn1.' + s
})
await p.locator('#invite').fill(code); await btn('Add contact').click(); await p.waitForTimeout(600)
const contact = await panel().innerText()
R.contactAdded = contact.includes('@carol') && /(\d{5} ){11}\d{5}/.test(contact)
await btn('Mark verified').click(); await p.waitForTimeout(200)
R.verified = (await panel().innerText()).includes('VERIFIED')
await p.screenshot({ path: OUT + 'zk-safety.png' })

// new private room with @carol + @nyx, then remove @nyx → key rotates to v1
await p.locator('section button[aria-label=Close]').first().click(); await p.waitForTimeout(200)
await p.locator('section button[aria-label=Close]').first().click(); await p.waitForTimeout(300)
await btn('＋ Private room').click()
await p.getByLabel('Room name').fill('Demo Day team')
await panel().getByRole('button', { name: /@carol/ }).click()
await panel().getByRole('button', { name: /@nyx/ }).click()
await btn(/Create encrypted room/).click(); await p.waitForTimeout(800)
R.roomCreated = (await panel().innerText()).includes('Demo Day team')
await p.getByLabel('Encrypted message').fill('first message in the new room'); await btn('Send').click(); await p.waitForTimeout(800)
await p.getByRole('button', { name: 'Room info' }).click(); await p.waitForTimeout(300)
await panel().locator('li', { hasText: '@nyx' }).getByRole('button', { name: 'Remove' }).click(); await p.waitForTimeout(800)
const info = await panel().innerText()
R.rotated = info.includes('@nyx removed · key rotated to v1') && info.includes('KEY V1')
R.nyxNotMember = (await panel().locator('li', { hasText: '@nyx' }).filter({ has: p.getByRole('button', { name: 'Remove' }) }).count()) === 0
await p.screenshot({ path: OUT + 'zk-room-info.png' })
console.log(JSON.stringify({ R, errs }, null, 1))
await b.close()

// iPhone (WebKit): tab reachable and chat renders
const w = await webkit.launch()
const m = await (await w.newContext({ ...devices['iPhone 15'] })).newPage()
m.on('pageerror', (e) => errs.push('iphone ' + e.message))
await m.goto('http://localhost:4701'); await m.waitForFunction(() => window.__map?.loaded(), null, { timeout: 120000 }); await m.waitForTimeout(5000)
await m.getByRole('button', { name: 'ZK Chat', exact: true }).click(); await m.waitForSelector('text=Share invite', { timeout: 15000 }); await m.waitForTimeout(800)
const dock = await m.evaluate(() => { const n = document.querySelector('nav div'); const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth] })
console.log('iphone dock', JSON.stringify(dock), 'errs', JSON.stringify(errs))
await m.screenshot({ path: OUT + 'zk-iphone.png' })
await w.close()
