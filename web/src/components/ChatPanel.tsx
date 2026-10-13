import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useZk, type Contact, type Room } from '../zkStore'
import { safetyNumber, shortFp } from '../lib/zk'
import { ago } from '../lib/format'
import { Avatar, Icon, Panel } from './bits'

type View = { k: 'home' } | { k: 'room'; id: string } | { k: 'add' } | { k: 'new' } | { k: 'info'; id: string } | { k: 'contact'; fp: string }

/** ZK Chat: end-to-end encrypted DMs + private group rooms over a zero-knowledge relay. */
export default function ChatPanel() {
  const me = useStore((s) => s.me)
  const z = useZk()
  const s = useStore.getState
  const [view, setView] = useState<View>({ k: 'home' })

  useEffect(() => {
    z.init(me.handle, me.avatar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!z.ready || !z.me)
    return (
      <Panel kicker="End-to-end encrypted" title="ZK Chat" onClose={() => s().setTab('explore')}>
        <p className="py-8 text-center text-[13px] text-fog">Generating your encryption keys…</p>
      </Panel>
    )

  if (view.k === 'room') return <RoomView id={view.id} back={() => setView({ k: 'home' })} info={() => setView({ k: 'info', id: view.id })} />
  if (view.k === 'info') return <RoomInfo id={view.id} back={() => setView({ k: 'room', id: view.id })} />
  if (view.k === 'add') return <AddPerson back={() => setView({ k: 'home' })} openContact={(fp) => setView({ k: 'contact', fp })} />
  if (view.k === 'new') return <NewRoom back={() => setView({ k: 'home' })} created={(id) => setView({ k: 'room', id })} />
  if (view.k === 'contact') return <ContactView fp={view.fp} back={() => setView({ k: 'add' })} chat={async () => setView({ k: 'room', id: await z.openDm(view.fp) })} />
  return <Home go={setView} />
}

function Home({ go }: { go: (v: View) => void }) {
  const z = useZk()
  const s = useStore.getState
  const [copied, setCopied] = useState(false)
  const rooms = useMemo(() => [...z.rooms].sort((a, b) => b.updatedAt - a.updatedAt), [z.rooms])
  const last = (r: Room) => {
    const l = z.envelopes[r.id]
    const e = l?.[l.length - 1]
    if (!e) return { text: r.kind === 'group' ? 'Room created' : 'Say hi', at: r.updatedAt }
    const t = z.plain[e.id]
    return { text: t === undefined ? 'Decrypting…' : t === null ? '🔒 Not readable (before you joined)' : t, at: e.ts }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(z.myInvite())
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      s().toast('Copy failed: long-press the code to copy', 'ember')
    }
  }

  return (
    <Panel kicker="End-to-end encrypted · zero-knowledge relay" title="ZK Chat" onClose={() => s().setTab('explore')}>
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[.03] p-4">
        <div className="flex items-center gap-3">
          <Avatar id={z.me!.avatar} handle={z.me!.handle} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] text-white">{z.me!.handle}</div>
            <div className="font-mono text-[10.5px] tracking-wider text-[#14f195]">KEY {shortFp(z.me!.fp).toUpperCase()}</div>
          </div>
          <button className="btn-ghost shrink-0 !px-3 !py-2 text-[12px]" onClick={copy}>
            {copied ? 'Copied ✓' : 'Share invite'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/40">Your private key never leaves this device. The relay stores only ciphertext and your public key.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button className="btn-ghost text-[13px]" onClick={() => go({ k: 'add' })}>
          ＋ Add person
        </button>
        <button className="btn-ghost text-[13px]" onClick={() => go({ k: 'new' })}>
          ＋ Private room
        </button>
      </div>

      <ul className="space-y-1">
        {rooms.map((r) => {
          const l = last(r)
          const other = r.kind === 'dm' ? z.contacts.find((c) => r.members.includes(c.fp)) : undefined
          return (
            <li key={r.id}>
              <button onClick={() => go({ k: 'room', id: r.id })} className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-white/[.04]">
                {other ? (
                  <Avatar id={other.avatar} handle={other.handle} size={40} />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px]" style={{ background: 'linear-gradient(135deg,#9945ff,#14f195)' }}>
                    🔐
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-white">
                      {r.name}
                      {other?.verified && <span className="ml-1 text-[11px] text-[#14f195]">✓</span>}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-fog">{ago(l.at)}</span>
                  </div>
                  <div className="truncate text-[12px] text-white/50">
                    {r.kind === 'group' && <span className="font-mono text-[10px] text-white/35">{r.members.length} · KEY v{r.epoch} · </span>}
                    {l.text}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function RoomView({ id, back, info }: { id: string; back: () => void; info: () => void }) {
  const z = useZk()
  const room = z.rooms.find((r) => r.id === id)
  const envs = z.envelopes[id] ?? []
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [envs.length])
  if (!room) return null
  const nameOf = (fp: string) => (fp === z.me!.fp ? 'you' : (z.contacts.find((c) => c.fp === fp)?.handle ?? shortFp(fp)))
  const avOf = (fp: string) => (fp === z.me!.fp ? z.me!.avatar : (z.contacts.find((c) => c.fp === fp)?.avatar ?? 'av:6'))

  return (
    <Panel
      kicker={room.kind === 'group' ? `Private room · ${room.members.length} members · key v${room.epoch}` : 'Direct · end-to-end encrypted'}
      title={room.name}
      onClose={back}
      right={
        <button onClick={info} className="glass-btn grid h-8 w-8 place-items-center !rounded-full !p-0 text-fog" aria-label="Room info">
          i
        </button>
      }
    >
      <div className="mb-3 flex items-center justify-between rounded-xl border border-[#14f195]/20 bg-[#14f195]/[.04] px-3 py-2">
        <span className="font-mono text-[10.5px] tracking-wider text-[#14f195]">🔒 AES-256-GCM · ECDH P-256</span>
        <label className="flex items-center gap-2 text-[11px] text-white/60">
          Show ciphertext
          <button role="switch" aria-checked={z.showCipher} aria-label="Show ciphertext" onClick={z.toggleCipher} className={`relative h-5 w-9 rounded-full border transition ${z.showCipher ? 'border-[#14f195]/60 bg-[#14f195]/25' : 'border-white/15 bg-white/[.04]'}`}>
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${z.showCipher ? 'left-4' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      <ul className="space-y-2.5">
        {envs.length === 0 && <li className="py-6 text-center text-[13px] text-fog">No messages yet. Only members can read what you send.</li>}
        {envs.map((e) => {
          const mine = e.from === z.me!.fp
          const t = z.plain[e.id]
          return (
            <li key={e.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && <Avatar id={avOf(e.from)} handle={nameOf(e.from)} size={26} />}
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'border border-white/15 bg-gradient-to-b from-white/[.12] to-white/[.03] text-white' : 'bg-white/[.05] text-white/90'}`}>
                {!mine && (
                  <div className="mb-0.5 text-[10px] text-fog">
                    {nameOf(e.from)} · {ago(e.ts)}
                  </div>
                )}
                {z.showCipher ? (
                  <code className="block font-mono text-[10px] leading-snug break-all text-[#14f195]/80">
                    iv {e.iv}
                    <br />
                    ct {e.ct.slice(0, 96)}
                    {e.ct.length > 96 ? '…' : ''}
                  </code>
                ) : t === null ? (
                  <span className="text-[12px] text-white/40 italic">🔒 Sent before you had the key (v{e.epoch})</span>
                ) : (
                  <span className="text-[13.5px] leading-snug">{t ?? '…'}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div ref={end} />
      <form
        className="sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t hairline bg-[var(--sheet-foot)] px-5 pt-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const body = text
          setText('')
          await z.send(id, body)
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Encrypted message…" aria-label="Encrypted message" />
        <button className="btn-ghost shrink-0" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </Panel>
  )
}

function RoomInfo({ id, back }: { id: string; back: () => void }) {
  const z = useZk()
  const room = z.rooms.find((r) => r.id === id)
  const [pick, setPick] = useState('')
  if (!room) return null
  const isAdmin = room.admin === z.me!.fp
  const outside = z.contacts.filter((c) => !room.members.includes(c.fp))
  const who = (fp: string): Pick<Contact, 'handle' | 'avatar'> & { verified?: boolean } =>
    fp === z.me!.fp ? { handle: `${z.me!.handle} (you)`, avatar: z.me!.avatar } : (z.contacts.find((c) => c.fp === fp) ?? { handle: shortFp(fp), avatar: 'av:6' })

  return (
    <Panel kicker={room.kind === 'group' ? `Private room · key v${room.epoch}` : 'Direct'} title={room.name} onClose={back}>
      <h3 className="mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Members</h3>
      <ul className="space-y-1">
        {room.members.map((fp) => {
          const m = who(fp)
          return (
            <li key={fp} className="flex items-center gap-3 rounded-xl p-2">
              <Avatar id={m.avatar} handle={m.handle} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-white">
                  {m.handle} {m.verified && <span className="text-[11px] text-[#14f195]">✓ verified</span>}
                  {fp === room.admin && <span className="ml-1 font-mono text-[9.5px] text-white/40">ADMIN</span>}
                </div>
                <div className="font-mono text-[10px] text-white/35">{shortFp(fp).toUpperCase()}</div>
              </div>
              {isAdmin && room.kind === 'group' && fp !== room.admin && (
                <button className="btn-ghost !px-2.5 !py-1.5 text-[11px] !text-fog" onClick={() => z.removeMember(id, fp)}>
                  Remove
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {isAdmin && room.kind === 'group' && (
        <div className="mt-4 flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="input" aria-label="Add member">
            <option value="">Add a contact…</option>
            {outside.map((c) => (
              <option key={c.fp} value={c.fp}>
                {c.handle}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost shrink-0 text-[13px]"
            disabled={!pick}
            onClick={async () => {
              await z.addMember(id, pick)
              setPick('')
            }}
          >
            Add
          </button>
        </div>
      )}

      {room.kind === 'group' && (
        <>
          <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Key history</h3>
          <ul className="space-y-1.5 border-l border-white/10 pl-3">
            {room.log.map((l, i) => (
              <li key={i} className="text-[12px] text-white/60">
                <span className="font-mono text-[10px] text-white/30">{ago(l.at)} · </span>
                {l.text}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-white/35">Adding or removing someone generates a new room key for the remaining members. New members can't read earlier messages, and removed members can't read new ones.</p>
        </>
      )}
    </Panel>
  )
}

function AddPerson({ back, openContact }: { back: () => void; openContact: (fp: string) => void }) {
  const z = useZk()
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <Panel kicker="Add to ZK Chat" title="Add person" onClose={back}>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setErr(null)
          const c = await z.addByInvite(code)
          if (!c) return setErr("That isn't a valid OPINION invite code (it starts with opn1.).")
          setCode('')
          openContact(c.fp)
        }}
      >
        <label className="text-[11px] tracking-[0.16em] text-fog uppercase" htmlFor="invite">
          Paste their invite code
        </label>
        <textarea id="invite" className="input min-h-[74px] font-mono text-[11px]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="opn1.eyJoIjoiQG55eCIs…" />
        <button className="btn-ghost w-full text-[13px]" disabled={!code.trim()}>
          Add contact
        </button>
        {err && <p className="text-[12px] text-ember">{err}</p>}
      </form>

      <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Contacts</h3>
      <ul className="space-y-1">
        {z.contacts.map((c) => (
          <li key={c.fp}>
            <button onClick={() => openContact(c.fp)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[.04]">
              <Avatar id={c.avatar} handle={c.handle} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-white">
                  {c.handle} {c.verified && <span className="text-[11px] text-[#14f195]">✓</span>}
                  {c.demoPriv && <span className="ml-1 font-mono text-[9.5px] text-white/30">DEMO PEER</span>}
                </div>
                <div className="font-mono text-[10px] text-white/35">{shortFp(c.fp).toUpperCase()}</div>
              </div>
              <Icon name="crews" className="h-4 w-4 text-fog" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ContactView({ fp, back, chat }: { fp: string; back: () => void; chat: () => void }) {
  const z = useZk()
  const c = z.contacts.find((x) => x.fp === fp)
  const [sn, setSn] = useState('')
  useEffect(() => {
    safetyNumber(z.me!.fp, fp).then(setSn)
  }, [fp, z.me])
  if (!c) return null
  return (
    <Panel kicker="Contact" title={c.handle} onClose={back}>
      <div className="flex items-center gap-3">
        <Avatar id={c.avatar} handle={c.handle} size={52} ring={c.verified ? '#14f195' : undefined} />
        <div className="font-mono text-[11px] leading-relaxed text-white/50">
          KEY {shortFp(c.fp).toUpperCase()}
          <br />
          {c.verified ? <span className="text-[#14f195]">VERIFIED</span> : 'NOT VERIFIED'}
        </div>
      </div>
      <h3 className="mt-5 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Safety number</h3>
      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 font-mono text-[15px] leading-loose tracking-wider text-white">
        {sn || '…'}
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">Compare this with {c.handle} in person. If both screens match, nobody is intercepting your messages.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn-ghost text-[13px]" onClick={() => z.verify(fp)}>
          {c.verified ? 'Unverify' : 'Mark verified'}
        </button>
        <button className="btn-ghost text-[13px]" onClick={chat}>
          Message
        </button>
      </div>
    </Panel>
  )
}

function NewRoom({ back, created }: { back: () => void; created: (id: string) => void }) {
  const z = useZk()
  const [name, setName] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const toggle = (fp: string) => setSel((s) => (s.includes(fp) ? s.filter((x) => x !== fp) : [...s, fp]))
  return (
    <Panel kicker="New private room" title="Create room" onClose={back}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Room name, e.g. Demo Day team" aria-label="Room name" />
      <h3 className="mt-5 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Members · {sel.length}</h3>
      <ul className="space-y-1">
        {z.contacts.map((c) => (
          <li key={c.fp}>
            <button onClick={() => toggle(c.fp)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${sel.includes(c.fp) ? 'bg-white/[.07] ring-1 ring-white/15' : 'hover:bg-white/[.04]'}`} aria-pressed={sel.includes(c.fp)}>
              <Avatar id={c.avatar} handle={c.handle} size={30} />
              <span className="flex-1 text-[13.5px] text-white">{c.handle}</span>
              <span className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] ${sel.includes(c.fp) ? 'border-[#14f195] bg-[#14f195] text-black' : 'border-white/20'}`}>{sel.includes(c.fp) ? '✓' : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        className="btn-ghost mt-4 w-full text-[13px]"
        disabled={!sel.length}
        onClick={async () => {
          const id = await z.createGroup(name, sel)
          created(id)
        }}
      >
        Create encrypted room · {sel.length + 1} members
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-white/35">A fresh 256-bit room key is generated on this device and sent to each member locked with your 1:1 key with them.</p>
    </Panel>
  )
}
