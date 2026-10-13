/**
 * ZK Chat crypto — end-to-end encryption with a zero-knowledge relay (the server only ever sees
 * public keys and ciphertext). Pure WebCrypto, works on iOS 15+ / every modern browser.
 *
 *  identity      ECDH P-256 key pair per user; fingerprint (fp) = SHA-256(x.y)
 *  1:1 key       ECDH(myPriv, theirPub) → HKDF-SHA256(salt "opinion-zk-v1", info = sorted fps) → AES-256-GCM
 *  group key     random AES-256 key per room *epoch*, wrapped for every member with that member's 1:1 key
 *  rotation      removing a member bumps the epoch → a fresh key only the remaining members receive
 *  message       AES-GCM, random 96-bit IV, AAD = room|from|epoch|ts (binds ciphertext to its context)
 */

const enc = new TextEncoder()
const dec = new TextDecoder()
const subtle = crypto.subtle
/** TS 6 types WebCrypto inputs as ArrayBuffer-backed views; our bytes always are. */
const bs = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>

export type PubJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string }
export type Identity = { fp: string; handle: string; avatar: string; pub: PubJwk; priv: JsonWebKey }
export type Wrapped = { iv: string; ct: string }

// ── base64url
export const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const unb64 = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '==='.slice((t.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// ── identity
export async function fingerprint(pub: PubJwk): Promise<string> {
  return hex(await subtle.digest('SHA-256', enc.encode(`${pub.x}.${pub.y}`)))
}

export async function newIdentity(handle: string, avatar: string): Promise<Identity> {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const pubFull = await subtle.exportKey('jwk', kp.publicKey)
  const pub: PubJwk = { kty: 'EC', crv: 'P-256', x: pubFull.x!, y: pubFull.y! }
  const priv = await subtle.exportKey('jwk', kp.privateKey)
  return { fp: await fingerprint(pub), handle, avatar, pub, priv }
}

/** Human-comparable safety number: 12 groups of 5 digits from both fingerprints (order-independent). */
export async function safetyNumber(fpA: string, fpB: string): Promise<string> {
  const [a, b] = [fpA, fpB].sort()
  const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`opinion-safety:${a}:${b}`)))
  const groups: string[] = []
  for (let i = 0; i < 12; i++) {
    const n = ((h[(i * 2) % 32] << 8) | h[(i * 2 + 1) % 32]) * 13 + h[(i + 7) % 32]
    groups.push(String(n % 100000).padStart(5, '0'))
  }
  return groups.join(' ')
}

/** Invite code someone pastes to add you: "opn1." + base64url(JSON). Carries only public data. */
export function inviteCode(id: Pick<Identity, 'handle' | 'avatar' | 'pub'>) {
  return 'opn1.' + b64(enc.encode(JSON.stringify({ h: id.handle, a: id.avatar, x: id.pub.x, y: id.pub.y })))
}
export async function parseInvite(code: string): Promise<{ fp: string; handle: string; avatar: string; pub: PubJwk } | null> {
  try {
    const raw = code.trim()
    if (!raw.startsWith('opn1.')) return null
    const o = JSON.parse(dec.decode(unb64(raw.slice(5))))
    if (typeof o.x !== 'string' || typeof o.y !== 'string') return null
    const pub: PubJwk = { kty: 'EC', crv: 'P-256', x: o.x, y: o.y }
    await subtle.importKey('jwk', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []) // throws if not a real curve point
    return { fp: await fingerprint(pub), handle: String(o.h ?? '@anon').slice(0, 24), avatar: String(o.a ?? 'av:0').slice(0, 16), pub }
  } catch {
    return null
  }
}

// ── keys
const pairCache = new Map<string, Promise<CryptoKey>>()

/** The 1:1 AES key between two identities. Both sides derive the same key; nobody else can. */
export function pairKey(me: Identity, them: { fp: string; pub: PubJwk }): Promise<CryptoKey> {
  const id = `${me.fp}:${them.fp}`
  let p = pairCache.get(id)
  if (!p) {
    p = (async () => {
      const priv = await subtle.importKey('jwk', me.priv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
      const pub = await subtle.importKey('jwk', them.pub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
      const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
      const info = enc.encode([me.fp, them.fp].sort().join(':'))
      return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('opinion-zk-v1'), info }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    })()
    pairCache.set(id, p)
  }
  return p
}

export async function newRoomKeyRaw(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(32))
}
export const importRoomKey = (raw: Uint8Array) => subtle.importKey('raw', bs(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])

// ── seal / open
export async function seal(key: CryptoKey, data: Uint8Array | string, aad = ''): Promise<Wrapped> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const pt = typeof data === 'string' ? enc.encode(data) : data
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, bs(pt))
  return { iv: b64(iv), ct: b64(ct) }
}
export async function openBytes(key: CryptoKey, w: Wrapped, aad = ''): Promise<Uint8Array> {
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv), additionalData: enc.encode(aad) }, key, unb64(w.ct)))
}
export async function openText(key: CryptoKey, w: Wrapped, aad = ''): Promise<string> {
  return dec.decode(await openBytes(key, w, aad))
}

export const msgAad = (room: string, from: string, epoch: number, ts: number) => `${room}|${from}|${epoch}|${ts}`
export const shortFp = (fp: string) => fp.slice(0, 4) + ' ' + fp.slice(4, 8) + ' ' + fp.slice(8, 12)
