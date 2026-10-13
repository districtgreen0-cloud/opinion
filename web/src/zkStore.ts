import { create } from 'zustand'
import {
  inviteCode,
  importRoomKey,
  msgAad,
  newIdentity,
  newRoomKeyRaw,
  openBytes,
  openText,
  pairKey,
  parseInvite,
  seal,
  type Identity,
  type PubJwk,
  type Wrapped,
} from './lib/zk'
import { HANDLES } from './data/mock'

/**
 * ZK Chat state. Persisted to this browser: identity, contacts, rooms (with *wrapped* keys) and
 * message envelopes (ciphertext only). Decrypted text lives in memory only.
 * Demo peers are real key pairs generated locally so the full E2EE round-trip is exercised offline.
 */

export type Contact = { fp: string; handle: string; avatar: string; pub: PubJwk; verified: boolean; addedAt: number; demoPriv?: JsonWebKey }
export type Room = {
  id: string
  kind: 'dm' | 'group'
  name: string
  members: string[]
  admin: string
  epoch: number
  keys: Record<string, { by: string; to: Record<string, Wrapped> }>
  updatedAt: number
  log: { at: number; text: string }[] // membership / key-rotation history (metadata, not message content)
}
export type Envelope = { id: string; room: string; from: string; epoch: number; iv: string; ct: string; ts: number }

type State = {
  ready: boolean
  me: Identity | null
  contacts: Contact[]
  rooms: Room[]
  envelopes: Record<string, Envelope[]>
  plain: Record<string, string | null> // envelope id → plaintext (null = cannot decrypt, e.g. removed from that epoch)
  activeRoom: string | null
  showCipher: boolean

  init: (handle: string, avatar: string) => Promise<void>
  setActive: (id: string | null) => void
  toggleCipher: () => void
  addByInvite: (code: string) => Promise<Contact | null>
  verify: (fp: string) => void
  openDm: (fp: string) => Promise<string>
  createGroup: (name: string, memberFps: string[]) => Promise<string>
  addMember: (roomId: string, fp: string) => Promise<void>
  removeMember: (roomId: string, fp: string) => Promise<void>
  send: (roomId: string, text: string) => Promise<void>
  myInvite: () => string
}

const K = (k: string) => 'opinion:zk:' + k
const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(K(k))
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(K(k), JSON.stringify(v))
  } catch {
    /* storage full / private mode — chat still works for this session */
  }
}
const rid = (n = 16) => {
  const a = crypto.getRandomValues(new Uint8Array(n))
  return [...a].map((b) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 57]).join('')
}

/** identity of any member we hold a private key for (me, or a local demo peer) */
function signer(s: State, fp: string): Identity | null {
  if (s.me && s.me.fp === fp) return s.me
  const c = s.contacts.find((x) => x.fp === fp)
  return c?.demoPriv ? { fp: c.fp, handle: c.handle, avatar: c.avatar, pub: c.pub, priv: c.demoPriv } : null
}
const pubOf = (s: State, fp: string): { fp: string; pub: PubJwk } | null => {
  if (s.me?.fp === fp) return { fp, pub: s.me.pub }
  const c = s.contacts.find((x) => x.fp === fp)
  return c ? { fp, pub: c.pub } : null
}

const roomKeyCache = new Map<string, Promise<CryptoKey | null>>()

/** The key `as` uses for messages in `room` at `epoch`. DM → 1:1 key; group → unwrap that epoch's room key. */
function keyFor(s: State, room: Room, epoch: number, as: Identity): Promise<CryptoKey | null> {
  const id = `${room.id}:${epoch}:${as.fp}`
  let p = roomKeyCache.get(id)
  if (!p) {
    p = (async () => {
      if (room.kind === 'dm') {
        const other = pubOf(s, room.members.find((m) => m !== as.fp) ?? '')
        return other ? pairKey(as, other) : null
      }
      const slot = room.keys[String(epoch)]
      const mine = slot?.to[as.fp]
      const wrapper = slot && pubOf(s, slot.by)
      if (!mine || !wrapper) return null // not a member at this epoch → cannot read
      try {
        const raw = await openBytes(await pairKey(as, wrapper), mine, `${room.id}|key|${epoch}`)
        return importRoomKey(raw)
      } catch {
        return null
      }
    })()
    roomKeyCache.set(id, p)
  }
  return p
}

async function wrapForAll(s: State, roomId: string, epoch: number, members: string[]) {
  const me = s.me!
  const raw = await newRoomKeyRaw()
  const to: Record<string, Wrapped> = {}
  for (const fp of members) {
    const other = pubOf(s, fp)
    if (other) to[fp] = await seal(await pairKey(me, other), raw, `${roomId}|key|${epoch}`)
  }
  raw.fill(0) // the raw key never leaves this function unwrapped
  return { by: me.fp, to }
}

const DEMO_LINES = [
  'see you at Olympia 👀', 'who is presenting at demo day?', 'grab coffee before the keynote?',
  'this room is encrypted right?', 'yes, the relay only sees ciphertext', 'bring your laptop, hacker house opens at 9',
  'sending the deck now', 'meet at the Somerset House courtyard', 'lfg 🔥', 'just verified your safety number ✓',
]

export const useZk = create<State>((set, get) => {
  const persist = () => {
    const s = get()
    save('contacts', s.contacts)
    save('rooms', s.rooms)
    save('env', s.envelopes)
  }

  const decrypt = async (env: Envelope) => {
    const s = get()
    const room = s.rooms.find((r) => r.id === env.room)
    if (!room || !s.me) return
    const key = await keyFor(s, room, env.epoch, s.me)
    let text: string | null = null
    if (key) {
      try {
        text = await openText(key, env, msgAad(env.room, env.from, env.epoch, env.ts))
      } catch {
        text = null // tampered or wrong key → refuse to show
      }
    }
    set({ plain: { ...get().plain, [env.id]: text } })
  }

  const push = async (env: Envelope) => {
    const list = [...(get().envelopes[env.room] ?? []), env].slice(-500)
    set({
      envelopes: { ...get().envelopes, [env.room]: list },
      rooms: get().rooms.map((r) => (r.id === env.room ? { ...r, updatedAt: env.ts } : r)),
    })
    persist()
    await decrypt(env)
  }

  /** a member we hold keys for writes a real encrypted message from *their* side */
  const sendAs = async (roomId: string, author: Identity, text: string) => {
    const s = get()
    const room = s.rooms.find((r) => r.id === roomId)
    if (!room) return
    const key = await keyFor(s, room, room.epoch, author)
    if (!key) return
    const ts = Date.now()
    const w = await seal(key, text, msgAad(roomId, author.fp, room.epoch, ts))
    await push({ id: rid(12), room: roomId, from: author.fp, epoch: room.epoch, ts, ...w })
  }

  const scheduleReply = (roomId: string) => {
    const s = get()
    const room = s.rooms.find((r) => r.id === roomId)
    const peers = room?.members.map((fp) => signer(s, fp)).filter((x): x is Identity => !!x && x.fp !== s.me?.fp) ?? []
    if (!peers.length) return
    const who = peers[Math.floor(Math.random() * peers.length)]
    setTimeout(() => sendAs(roomId, who, DEMO_LINES[Math.floor(Math.random() * DEMO_LINES.length)]), 1400 + Math.random() * 2600)
  }

  return {
    ready: false,
    me: null,
    contacts: [],
    rooms: [],
    envelopes: {},
    plain: {},
    activeRoom: null,
    showCipher: false,

    init: async (handle, avatar) => {
      if (get().ready) return
      let me = load<Identity | null>('id', null)
      if (!me) {
        me = await newIdentity(handle, avatar)
        save('id', me)
      }
      let contacts = load<Contact[]>('contacts', [])
      const firstRun = contacts.length === 0
      if (firstRun) {
        // demo peers: real key pairs, kept locally so they can answer
        contacts = []
        for (const [i, h] of HANDLES.slice(0, 6).entries()) {
          const id = await newIdentity(h, `av:${i}`)
          contacts.push({ fp: id.fp, handle: h, avatar: id.avatar, pub: id.pub, verified: false, addedAt: Date.now(), demoPriv: id.priv })
        }
      }
      set({ me, contacts, rooms: load('rooms', []), envelopes: load('env', {}), ready: true })
      if (firstRun) {
        const dm = await get().openDm(contacts[0].fp)
        await sendAs(dm, signer(get(), contacts[0].fp)!, 'hey 👋 this chat is end-to-end encrypted')
        const g = await get().createGroup('Breakpoint crew 🔐', contacts.slice(1, 4).map((c) => c.fp))
        await sendAs(g, signer(get(), contacts[1].fp)!, 'welcome to the private room. only members hold the key')
      } else {
        for (const list of Object.values(get().envelopes)) for (const env of list) decrypt(env)
      }
      persist()
    },

    setActive: (activeRoom) => set({ activeRoom }),
    toggleCipher: () => set({ showCipher: !get().showCipher }),

    addByInvite: async (code) => {
      const parsed = await parseInvite(code)
      const me = get().me
      if (!parsed || !me || parsed.fp === me.fp) return null
      const existing = get().contacts.find((c) => c.fp === parsed.fp)
      if (existing) return existing
      const c: Contact = { ...parsed, verified: false, addedAt: Date.now() }
      set({ contacts: [...get().contacts, c] })
      persist()
      return c
    },
    verify: (fp) => {
      set({ contacts: get().contacts.map((c) => (c.fp === fp ? { ...c, verified: !c.verified } : c)) })
      persist()
    },

    openDm: async (fp) => {
      const me = get().me!
      const members = [me.fp, fp].sort()
      const id = 'dm_' + members.map((m) => m.slice(0, 12)).join('')
      if (!get().rooms.some((r) => r.id === id)) {
        const c = get().contacts.find((x) => x.fp === fp)
        const room: Room = { id, kind: 'dm', name: c?.handle ?? 'Direct', members, admin: me.fp, epoch: 0, keys: {}, updatedAt: Date.now(), log: [] }
        set({ rooms: [room, ...get().rooms] })
        persist()
      }
      return id
    },

    createGroup: async (name, memberFps) => {
      const me = get().me!
      const id = 'g_' + rid(14)
      const members = [me.fp, ...memberFps.filter((f) => f !== me.fp)]
      const slot = await wrapForAll(get(), id, 0, members)
      const room: Room = { id, kind: 'group', name: name.trim().slice(0, 60) || 'Private room', members, admin: me.fp, epoch: 0, keys: { '0': slot }, updatedAt: Date.now(), log: [{ at: Date.now(), text: `Room created · key v0 shared with ${members.length} members` }] }
      set({ rooms: [room, ...get().rooms] })
      persist()
      return id
    },

    // adding or removing a member rotates the key: new members can't read history, removed ones can't read the future
    addMember: async (roomId, fp) => {
      const room = get().rooms.find((r) => r.id === roomId)
      if (!room || room.kind !== 'group' || room.admin !== get().me?.fp || room.members.includes(fp)) return
      const members = [...room.members, fp]
      const epoch = room.epoch + 1
      const slot = await wrapForAll(get(), roomId, epoch, members)
      const who = get().contacts.find((c) => c.fp === fp)?.handle ?? 'member'
      const next: Room = { ...room, members, epoch, keys: { ...room.keys, [String(epoch)]: slot }, updatedAt: Date.now(), log: [...room.log, { at: Date.now(), text: `${who} added · key rotated to v${epoch}` }] }
      set({ rooms: get().rooms.map((r) => (r.id === roomId ? next : r)) })
      persist()
    },
    removeMember: async (roomId, fp) => {
      const room = get().rooms.find((r) => r.id === roomId)
      if (!room || room.kind !== 'group' || room.admin !== get().me?.fp || fp === room.admin) return
      const members = room.members.filter((m) => m !== fp)
      const epoch = room.epoch + 1
      const slot = await wrapForAll(get(), roomId, epoch, members)
      const who = get().contacts.find((c) => c.fp === fp)?.handle ?? 'member'
      const next: Room = { ...room, members, epoch, keys: { ...room.keys, [String(epoch)]: slot }, updatedAt: Date.now(), log: [...room.log, { at: Date.now(), text: `${who} removed · key rotated to v${epoch}` }] }
      set({ rooms: get().rooms.map((r) => (r.id === roomId ? next : r)) })
      persist()
    },

    send: async (roomId, text) => {
      const me = get().me
      const body = text.trim().slice(0, 2000)
      if (!me || !body) return
      await sendAs(roomId, me, body)
      scheduleReply(roomId)
    },

    myInvite: () => {
      const me = get().me
      return me ? inviteCode(me) : ''
    },
  }
})
