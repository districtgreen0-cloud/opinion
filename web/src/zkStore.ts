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
import { LIVE } from './lib/api'
import { useStore } from './store'

// ── relay (live): the server stores public keys, room records with wrapped keys, and ciphertext. Nothing readable.
const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = (RAW ?? '').replace(/\/$/, '')
type ServerRoom = Omit<Room, 'log'>
type ServerKey = { fp: string; handle: string; avatar: string; pub: PubJwk }
async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const r = await fetch(`${BASE}/api/zk${path}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...init })
    const j = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, data: j as T } : { ok: false, status: r.status, error: (j as { error?: string }).error ?? 'error' }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}
const sockets = new Map<string, WebSocket>()
let poll: ReturnType<typeof setInterval> | null = null
let booting = true

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
  unread: Record<string, number>
  /** a handle to open a DM with as soon as the chat panel is up (profile card → Message) */
  pending: string | null

  init: (handle: string, avatar: string, accountId?: string) => Promise<void>
  sync: () => Promise<void>
  addByHandle: (handle: string) => Promise<Contact | null>
  requestDm: (handle: string | null) => void
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

let ns = '' // live: one key store per account on this device
const K = (k: string) => 'opinion:zk:' + ns + k
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
      const slot = room.keys[String(epoch)]
      if (!slot && room.kind === 'dm') {
        // local demo DMs have no wrapped key: the 1:1 key is the room key
        const other = pubOf(s, room.members.find((m) => m !== as.fp) ?? '')
        return other ? pairKey(as, other) : null
      }
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
        text = await openText(key, env, msgAad(env.room, env.from, env.epoch, env.id))
      } catch {
        try {
          text = await openText(key, env, msgAad(env.room, env.from, env.epoch, env.ts)) // messages saved before the relay
        } catch {
          text = null // tampered or wrong key → refuse to show
        }
      }
    }
    set({ plain: { ...get().plain, [env.id]: text } })
  }

  const push = async (env: Envelope) => {
    if (get().envelopes[env.room]?.some((e) => e.id === env.id)) return // already have it (socket + poll both deliver)
    const list = [...(get().envelopes[env.room] ?? []), env].sort((a, b) => a.ts - b.ts).slice(-500)
    set({
      envelopes: { ...get().envelopes, [env.room]: list },
      rooms: get().rooms.map((r) => (r.id === env.room ? { ...r, updatedAt: env.ts } : r)),
    })
    persist()
    await decrypt(env)
  }

  /** a member we hold keys for writes a real encrypted message from *their* side */
  const sendAs = async (roomId: string, author: Identity | null | undefined, text: string) => {
    const s = get()
    const room = s.rooms.find((r) => r.id === roomId)
    if (!room || !author) return // identity not ready yet (first open) or a peer we hold no key for
    const key = await keyFor(s, room, room.epoch, author)
    if (!key) return
    const id = rid(16)
    const w = await seal(key, text, msgAad(roomId, author.fp, room.epoch, id))
    const env: Envelope = { id, room: roomId, from: author.fp, epoch: room.epoch, ts: Date.now(), ...w }
    if (!LIVE) return push(env)
    const r = await api<Envelope>(`/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ envelope: env }) })
    if (!r.ok) return void useStore.getState().toast(r.error === 'rate_limited' ? 'Slow down a little.' : r.error === 'not_a_member' ? 'You are no longer in this room.' : 'Message not sent. Check your connection.', 'ember')
    await push(r.data) // the relay's copy carries its timestamp
  }

  // ── live relay plumbing
  const contactFor = async (fp: string): Promise<Contact | null> => {
    const have = get().contacts.find((c) => c.fp === fp)
    if (have) return have
    const r = await api<ServerKey>(`/keys/${fp}`)
    if (!r.ok || get().me?.fp === fp) return null
    const c: Contact = { fp: r.data.fp, handle: r.data.handle, avatar: r.data.avatar, pub: r.data.pub, verified: false, addedAt: Date.now() }
    if (!get().contacts.some((x) => x.fp === fp)) set({ contacts: [...get().contacts, c] })
    return c
  }
  /** take the relay's room record: members, epoch and wrapped keys are the server's; the log stays local */
  const adopt = async (sr: ServerRoom) => {
    const me = get().me
    if (!me) return
    for (const fp of sr.members) if (fp !== me.fp) await contactFor(fp)
    const old = get().rooms.find((r) => r.id === sr.id)
    const other = sr.kind === 'dm' ? get().contacts.find((c) => sr.members.includes(c.fp)) : undefined
    const log = old?.log ?? []
    if (old && old.epoch !== sr.epoch) log.push({ at: Date.now(), text: `Members changed · key rotated to v${sr.epoch}` })
    const room: Room = { ...sr, name: sr.kind === 'dm' ? (other?.handle ?? old?.name ?? 'Direct') : sr.name, log }
    set({ rooms: old ? get().rooms.map((r) => (r.id === sr.id ? room : r)) : [room, ...get().rooms] })
    if (old && old.epoch !== sr.epoch) for (const e of get().envelopes[sr.id] ?? []) if (get().plain[e.id] == null) decrypt(e)
  }
  const ingest = async (env: Envelope, quiet = false) => {
    const s = get()
    if (s.envelopes[env.room]?.some((e) => e.id === env.id)) return
    await push(env)
    if (env.from === s.me?.fp) return
    const watching = get().activeRoom === env.room && useStore.getState().tab === 'chat' && document.visibilityState === 'visible'
    if (watching) return
    set({ unread: { ...get().unread, [env.room]: (get().unread[env.room] ?? 0) + 1 } })
    save('unread', get().unread)
    if (quiet) return
    const who = get().contacts.find((c) => c.fp === env.from)?.handle ?? 'Someone'
    const room = get().rooms.find((r) => r.id === env.room)
    useStore.getState().toast(room?.kind === 'group' ? `${who} in ${room.name}` : `New message from ${who}`, 'violet')
  }
  const watch = (roomId: string) => {
    if (sockets.has(roomId) || sockets.size >= 30) return
    try {
      const ws = new WebSocket(`${BASE || location.origin}/api/zk/rooms/${roomId}/ws`.replace(/^http/, 'ws'))
      sockets.set(roomId, ws)
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data)) as { type: string; envelope?: Envelope; room?: ServerRoom }
          if (m.type === 'msg' && m.envelope) ingest(m.envelope)
          else if (m.type === 'room' && m.room) m.room.members.includes(get().me?.fp ?? '') ? adopt(m.room).then(persist) : get().sync()
        } catch {
          /* not for us */
        }
      }
      ws.onclose = () => sockets.delete(roomId) // the next sync reconnects
      ws.onerror = () => ws.close()
    } catch {
      /* sockets blocked: polling still delivers */
    }
  }
  const putRoom = async (room: Room) => {
    const { log: _log, ...record } = room
    void _log
    return api<ServerRoom>(`/rooms/${room.id}`, { method: 'PUT', body: JSON.stringify({ room: record, by: get().me!.fp }) })
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
    unread: {},
    pending: null,
    requestDm: (pending) => set({ pending }),

    init: async (handle, avatar, accountId) => {
      const space = LIVE ? `${accountId ?? 'anon'}:` : ''
      if (get().ready && ns === space) return
      if (ns !== space) {
        // another account on this device: its keys and chats are separate
        for (const ws of sockets.values()) ws.close()
        sockets.clear()
        roomKeyCache.clear()
        set({ ready: false, me: null, contacts: [], rooms: [], envelopes: {}, plain: {}, activeRoom: null, unread: {} })
      }
      ns = space
      booting = true
      let me = load<Identity | null>('id', null)
      if (!me) me = await newIdentity(handle, avatar)
      me = { ...me, handle, avatar }
      save('id', me)
      let contacts = load<Contact[]>('contacts', [])
      const firstRun = !LIVE && contacts.length === 0
      if (firstRun) {
        // demo peers: real key pairs, kept locally so they can answer
        contacts = []
        for (const [i, h] of HANDLES.slice(0, 6).entries()) {
          const id = await newIdentity(h, `av:${i}`)
          contacts.push({ fp: id.fp, handle: h, avatar: id.avatar, pub: id.pub, verified: false, addedAt: Date.now(), demoPriv: id.priv })
        }
      }
      set({ me, contacts, rooms: load('rooms', []), envelopes: load('env', {}), unread: load('unread', {}), ready: true })
      if (firstRun) {
        const dm = await get().openDm(contacts[0].fp)
        await sendAs(dm, signer(get(), contacts[0].fp), 'hey 👋 this chat is end-to-end encrypted')
        const g = await get().createGroup('Breakpoint crew 🔐', contacts.slice(1, 4).map((c) => c.fp))
        await sendAs(g, signer(get(), contacts[1].fp), 'welcome to the private room. only members hold the key')
      } else {
        for (const list of Object.values(get().envelopes)) for (const env of list) decrypt(env)
      }
      persist()
      if (LIVE) {
        await api('/keys', { method: 'POST', body: JSON.stringify({ fp: me.fp, pub: me.pub, handle, avatar }) }) // public key only
        await get().sync()
        if (poll) clearInterval(poll)
        poll = setInterval(() => document.visibilityState === 'visible' && get().sync(), 20_000)
      }
    },

    /** live: pull my rooms and any messages I missed, and keep a socket open on each room */
    sync: async () => {
      const me = get().me
      if (!LIVE || !me) return
      const r = await api<{ rooms: ServerRoom[] }>(`/rooms?member=${me.fp}`)
      if (!r.ok) return
      const lastSync = load<number>('lastSync', Infinity) // new device: old history is not "unread"
      for (const sr of r.data.rooms) {
        await adopt(sr)
        watch(sr.id)
        let since = (get().envelopes[sr.id] ?? []).reduce((m, e) => Math.max(m, e.ts), 0)
        for (let page = 0; page < 5; page++) {
          const m = await api<{ messages: Envelope[] }>(`/rooms/${sr.id}/messages?since=${since}`)
          if (!m.ok || !m.data.messages.length) break
          // first sync after opening the app: no pop-ups; what arrived since the last visit still counts as unread
          for (const e of m.data.messages) booting ? (e.ts > lastSync ? await ingest(e, true) : await push(e)) : await ingest(e)
          since = m.data.messages[m.data.messages.length - 1]!.ts
          if (m.data.messages.length < 200) break
        }
      }
      booting = false
      save('lastSync', Date.now())
      persist()
    },

    addByHandle: async (handle) => {
      const me = get().me
      const h = handle.trim()
      if (!me || !h) return null
      const r = await api<ServerKey>(`/keys?handle=${encodeURIComponent(h.startsWith('@') ? h : '@' + h)}`)
      if (!r.ok || r.data.fp === me.fp) return null
      const have = get().contacts.find((c) => c.fp === r.data.fp)
      if (have) return have
      const c: Contact = { fp: r.data.fp, handle: r.data.handle, avatar: r.data.avatar, pub: r.data.pub, verified: false, addedAt: Date.now() }
      set({ contacts: [...get().contacts, c] })
      persist()
      return c
    },

    setActive: (activeRoom) => {
      set({ activeRoom })
      if (activeRoom && get().unread[activeRoom]) {
        const unread = { ...get().unread }
        delete unread[activeRoom]
        set({ unread })
        save('unread', unread)
      }
    },
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
      if (get().rooms.some((r) => r.id === id)) return id
      const c = get().contacts.find((x) => x.fp === fp)
      if (LIVE) {
        const there = await api<ServerRoom>(`/rooms/${id}`) // they may have opened it first
        if (there.ok) await adopt(there.data)
        else {
          const room: Room = { id, kind: 'dm', name: c?.handle ?? 'Direct', members, admin: me.fp, epoch: 0, keys: { '0': await wrapForAll(get(), id, 0, members) }, updatedAt: Date.now(), log: [] }
          const put = await putRoom(room)
          if (put.ok) await adopt(put.data)
          else {
            const again = await api<ServerRoom>(`/rooms/${id}`) // both opened it at once: theirs won
            if (again.ok) await adopt(again.data)
            else {
              useStore.getState().toast('Could not open the chat. Check your connection.', 'ember')
              return id
            }
          }
        }
        watch(id)
      } else {
        const room: Room = { id, kind: 'dm', name: c?.handle ?? 'Direct', members, admin: me.fp, epoch: 0, keys: {}, updatedAt: Date.now(), log: [] }
        set({ rooms: [room, ...get().rooms] })
      }
      persist()
      return id
    },

    createGroup: async (name, memberFps) => {
      const me = get().me!
      const id = 'g_' + rid(14)
      const members = [me.fp, ...memberFps.filter((f) => f !== me.fp)]
      const slot = await wrapForAll(get(), id, 0, members)
      const room: Room = { id, kind: 'group', name: name.trim().slice(0, 60) || 'Private room', members, admin: me.fp, epoch: 0, keys: { '0': slot }, updatedAt: Date.now(), log: [{ at: Date.now(), text: `Room created · key v0 shared with ${members.length} members` }] }
      if (LIVE) {
        const put = await putRoom(room)
        if (!put.ok) {
          useStore.getState().toast('Could not create the room. Check your connection.', 'ember')
          return ''
        }
        watch(id)
      }
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
      if (LIVE && !(await putRoom(next)).ok) return void useStore.getState().toast('Could not add them. Try again.', 'ember')
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
      if (LIVE && !(await putRoom(next)).ok) return void useStore.getState().toast('Could not remove them. Try again.', 'ember')
      set({ rooms: get().rooms.map((r) => (r.id === roomId ? next : r)) })
      persist()
    },

    send: async (roomId, text) => {
      const me = get().me
      const body = text.trim().slice(0, 2000)
      if (!me || !body) return
      await sendAs(roomId, me, body)
      if (!LIVE) scheduleReply(roomId) // demo peers answer; live people answer for themselves
    },

    myInvite: () => {
      const me = get().me
      return me ? inviteCode(me) : ''
    },
  }
})
