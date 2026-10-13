// Node unit test for src/lib/zk.ts (Node 24 runs TS directly + has WebCrypto). Run: node e2e/zk-crypto.test.mjs
import * as zk from '../src/lib/zk.ts'
let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? '✓ ' : '✗ ') + name) }
const throwsAsync = async (f) => { try { await f(); return false } catch { return true } }

const alice = await zk.newIdentity('@alice', 'av:1')
const bob = await zk.newIdentity('@bob', 'av:2')
const eve = await zk.newIdentity('@eve', 'av:3')
ok('fingerprint is 64 hex chars', /^[0-9a-f]{64}$/.test(alice.fp))
ok('fingerprint matches recomputation', alice.fp === (await zk.fingerprint(alice.pub)))

// 1:1 key agreement
const kAB = await zk.pairKey(alice, bob), kBA = await zk.pairKey(bob, alice)
const aad = zk.msgAad('room1', alice.fp, 0, 123)
const w = await zk.seal(kAB, 'hello bob 🔐', aad)
ok('bob decrypts alice (same derived key)', (await zk.openText(kBA, w, aad)) === 'hello bob 🔐')
ok('ciphertext does not contain plaintext', !w.ct.includes('hello') && w.iv.length === 16)
const kEA = await zk.pairKey(eve, alice)
ok('eve cannot decrypt', await throwsAsync(() => zk.openText(kEA, w, aad)))
ok('wrong AAD (moved to another room) rejected', await throwsAsync(() => zk.openText(kBA, w, zk.msgAad('room2', alice.fp, 0, 123))))
const tampered = { ...w, ct: (w.ct[0] === 'A' ? 'B' : 'A') + w.ct.slice(1) }
ok('tampered ciphertext rejected', await throwsAsync(() => zk.openText(kBA, tampered, aad)))
const w2 = await zk.seal(kAB, 'hello bob 🔐', aad)
ok('fresh random IV per message', w2.iv !== w.iv && w2.ct !== w.ct)

// group key wrapping
const raw = await zk.newRoomKeyRaw()
const wrapped = await zk.seal(await zk.pairKey(alice, bob), raw, 'g1|key|0')
const unwrapped = await zk.openBytes(await zk.pairKey(bob, alice), wrapped, 'g1|key|0')
ok('bob unwraps the room key', unwrapped.length === 32 && unwrapped.every((b, i) => b === raw[i]))
const rk = await zk.importRoomKey(unwrapped)
const gm = await zk.seal(await zk.importRoomKey(raw), 'group hi', 'g1|x|0|1')
ok('group message readable with unwrapped key', (await zk.openText(rk, gm, 'g1|x|0|1')) === 'group hi')
ok('eve cannot unwrap bob\'s copy', await throwsAsync(async () => zk.openBytes(await zk.pairKey(eve, alice), wrapped, 'g1|key|0')))

// invites + safety numbers
const code = zk.inviteCode(bob)
const parsed = await zk.parseInvite(code)
ok('invite round-trips to the same fingerprint', parsed?.fp === bob.fp && parsed?.handle === '@bob')
ok('invite carries no private key', !code.includes(bob.priv.d))
ok('garbage invite rejected', (await zk.parseInvite('opn1.bm9wZQ')) === null && (await zk.parseInvite('hello')) === null)
ok('off-curve point rejected', (await zk.parseInvite('opn1.' + zk.b64(new TextEncoder().encode(JSON.stringify({ h: '@x', x: bob.pub.x, y: alice.pub.y })))) ) === null)
const sn1 = await zk.safetyNumber(alice.fp, bob.fp), sn2 = await zk.safetyNumber(bob.fp, alice.fp)
ok('safety number identical on both sides', sn1 === sn2 && /^(\d{5} ){11}\d{5}$/.test(sn1))
ok('safety number differs for another pair', sn1 !== (await zk.safetyNumber(alice.fp, eve.fp)))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
