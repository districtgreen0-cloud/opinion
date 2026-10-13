import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { cityData } from '../data/mock'
import { toCell, cellCenter, shortCell, H3_RES } from '../lib/h3'
import { postComment, hexSocket, LIVE, type PostResult } from '../lib/api'
import { createPortal } from 'react-dom'
import { locate } from '../hooks/useGeolocation'
import { ago, km, fmtKm, timeLabel } from '../lib/format'
import { kindOf, type Comment } from '../lib/types'
import { Avatar, Panel } from './bits'
import JobCard from './JobCard'
import { Person } from './Profile'
import CameraCapture from './CameraCapture'
import { limitsFor, reportMemory, saveMemory, useHexMemories, type Memory } from '../lib/memories'

type HexTab = 'topic' | 'note' | 'job' | 'memory'
const TABS: { id: HexTab; label: string; empty: string }[] = [
  { id: 'topic', label: 'Topics', empty: 'No topics yet. Start a conversation about this place.' },
  { id: 'note', label: 'Notes', empty: 'Silence. Leave the first note in this hex.' },
  { id: 'job', label: 'Jobs', empty: 'No jobs here. Post one, paid in USDC.' },
  { id: 'memory', label: 'Memories', empty: 'No memories here yet. Capture this place.' },
]
const REWARD: Record<HexTab, [number, string]> = { topic: [15, 'topic started'], note: [10, 'note dropped'], job: [10, 'job posted'], memory: [10, 'memory saved'] }

export default function HexSheet() {
  const cell = useStore((s) => s.selectedCell)!
  const city = useStore((s) => s.city)
  const all = useStore((s) => s.comments)
  const pos = useStore((s) => s.pos)
  const me = useStore((s) => s.me)
  const wallet = useStore((s) => s.wallet)
  const geo = useStore((s) => s.geoStatus)
  const place = useStore((s) => s.selectedPlace)
  const tab = useStore((s) => s.hexTab)
  const s = useStore.getState

  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({ text: '', title: '', price: '' })
  const memories = useHexMemories(cell)
  const [camera, setCamera] = useState(false)
  const [viewing, setViewing] = useState<Memory | null>(null)
  // demo: count across all your hexes (this browser) · live: the server enforces the daily cap
  // the 📷 cube asks for the camera straight away
  const cameraRequest = useStore((s) => s.cameraRequest)
  useEffect(() => {
    if (cameraRequest && Date.now() - cameraRequest < 3000 && here && tab === 'memory') setCamera(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRequest])
  const navigateHere = () => {
    const st = s()
    const pt = st.pickPoint && toCell(st.pickPoint[1], st.pickPoint[0]) === cell ? st.pickPoint : ([clng, clat] as [number, number])
    st.startNav(pt, ev ? ev.venue : place ? place.name : 'Dropped pin')
  }
  const lim = LIVE ? limitsFor(me.handle, cell, memories) : limitsFor(me.handle, cell)

  const inHex = useMemo(() => all.filter((c) => c.cell === cell), [all, cell])
  const by = useMemo(() => {
    const topics = inHex.filter((c) => kindOf(c) === 'topic')
    const replies = inHex.filter((c) => kindOf(c) === 'reply')
    return {
      topic: topics,
      note: inHex.filter((c) => kindOf(c) === 'note'),
      job: inHex.filter((c) => kindOf(c) === 'job'),
      replies: (id: string) => replies.filter((r) => r.parentId === id).sort((a, b) => a.createdAt - b.createdAt),
      lastActive: (t: Comment) => Math.max(t.createdAt, ...replies.filter((r) => r.parentId === t.id).map((r) => r.createdAt)),
    }
  }, [inHex])
  const ev = useMemo(() => cityData(city).events.find((e) => toCell(e.lat, e.lng) === cell), [city, cell])
  const topic = openTopic ? by.topic.find((t) => t.id === openTopic) : undefined

  const myCell = pos ? toCell(pos.lat, pos.lng) : null
  const here = myCell === cell
  const [clng, clat] = cellCenter(cell)
  const dist = pos ? km(pos.lat, pos.lng, clat, clng) : null

  useEffect(() => hexSocket(cell, (c) => useStore.getState().addComment(c)), [cell])
  useEffect(() => {
    setErr(null)
    setOpenTopic(null)
  }, [cell, tab])

  const teleportHere = () => {
    s().setPos({ lat: clat, lng: clng, source: 'teleport' })
    s().toast('Teleported · demo mode', 'ember')
  }

  const submit = async () => {
    if (!pos) return
    const text = f.text.trim().slice(0, 500)
    const title = f.title.trim().slice(0, 80)
    const price = Math.round(Number(f.price) * 100) / 100
    const base = { lat: pos.lat, lng: pos.lng, handle: me.handle, avatar: me.avatar, wallet: wallet?.address }
    let body: Parameters<typeof postComment>[1]
    if (topic) {
      if (!text) return
      body = { ...base, kind: 'reply', parentId: topic.id, text }
    } else if (tab === 'topic') {
      if (!title) return setErr('Give the topic a title.')
      body = { ...base, kind: 'topic', title, text }
    } else if (tab === 'job') {
      if (!wallet) return setErr('Connect a wallet: the job is paid from it through escrow.')
      if (!title) return setErr('What is the job?')
      if (!(price >= 1 && price <= 100000)) return setErr('Set a price between 1 and 100,000 USDC.')
      body = { ...base, kind: 'job', title, text, priceUsdc: price }
    } else {
      if (!text) return
      body = { ...base, kind: 'note', text: text.slice(0, 280) }
    }
    setBusy(true)
    setErr(null)
    const r: PostResult = await postComment(cell, body)
    setBusy(false)
    if (!r.ok) {
      return setErr(
        r.reason === 'not_here' ? 'Server says you are not in this hex.'
        : r.reason === 'rate_limited' ? 'Slow down: 5 posts per minute.'
        : r.reason === 'wallet_required' ? 'Connect a wallet to post a job.'
        : r.reason === 'invalid' ? 'Check the fields and try again.'
        : 'Could not post. Try again.',
      )
    }
    s().addComment(r.comment) // dedups with the WebSocket echo by id
    setF({ text: '', title: '', price: '' })
    const [pts, why] = topic ? [5, 'reply'] as const : REWARD[tab]
    s().award(pts, why)
    if (tab === 'job' && !topic) s().toast('Now fund the escrow to publish it', 'violet')
  }

  return (
    <Panel
      kicker={`${place && !ev ? place.kind.replace(/_/g, ' ') + ' · ' : ''}Hex ${shortCell(cell)} · res ${H3_RES}`}
      title={ev ? ev.venue : place ? place.name : 'This hex'}
      onClose={() => s().selectCell(null)}
    >
      {ev && (
        <button onClick={() => s().setTab('events')} className="mb-4 flex w-full items-center gap-3 rounded-2xl border hairline p-3 text-left hover:bg-white/[.03]">
          <div className="h-12 w-12 shrink-0 rounded-xl" style={{ background: ev.cover }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-fog">
              {ev.status === 'live' ? <><span className="live-dot" /> LIVE NOW</> : <span className="text-mint">UPCOMING · {timeLabel(ev.startsAt)}</span>}
            </div>
            <div className="truncate text-[14px] font-medium text-white">{ev.title}</div>
          </div>
        </button>
      )}

      <button onClick={navigateHere} className="btn-black mb-3 flex w-full items-center justify-center gap-2 !rounded-2xl !py-2 text-[13px]" aria-label="Navigate here">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 11l18-8-8 18-2-8z" />
        </svg>
        Navigate here{dist !== null ? <span className="text-fog">· {fmtKm(dist)}</span> : null}
      </button>

      {/* sections per hex */}
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl border hairline bg-white/[.02] p-1" role="tablist" aria-label="Hex sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => s().setHexTab(t.id)}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-[11.5px] font-medium transition sm:gap-1.5 sm:text-[12.5px] ${tab === t.id ? 'bg-gradient-to-b from-white/[.14] to-white/[.03] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]' : 'text-fog hover:text-white'}`}
          >
            {t.label}
            <span className="num text-[11px] text-white/40">{t.id === 'memory' ? memories.length : by[t.id].length}</span>
          </button>
        ))}
      </div>

      {/* ── lists */}
      {topic ? (
        <div>
          <button className="mb-3 text-[12px] text-fog hover:text-white" onClick={() => setOpenTopic(null)}>
            ← All topics
          </button>
          <h3 className="font-display text-[18px] leading-tight font-semibold text-white">{topic.title}</h3>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-fog">
            <Person handle={topic.handle} avatar={topic.avatar} className="flex items-center gap-1.5"><Avatar id={topic.avatar} handle={topic.handle} size={14} /> <span className="text-white/80">{topic.handle}</span></Person> · {ago(topic.createdAt)}
          </div>
          {topic.text && <p className="mt-2 text-[14px] leading-snug text-white/85">{topic.text}</p>}
          <ul className="mt-4 space-y-3 border-l border-white/10 pl-3">
            {by.replies(topic.id).map((c) => (
              <PostRow key={c.id} c={c} />
            ))}
            {by.replies(topic.id).length === 0 && <li className="text-[12px] text-fog">No replies yet.</li>}
          </ul>
        </div>
      ) : tab === 'topic' ? (
        <ul className="space-y-2">
          {by.topic.length === 0 && <Empty text={TABS[0].empty} />}
          {[...by.topic].sort((a, b) => by.lastActive(b) - by.lastActive(a)).map((t) => (
            <li key={t.id}>
              <button onClick={() => setOpenTopic(t.id)} className="w-full rounded-2xl border hairline bg-white/[.02] p-3 text-left transition hover:bg-white/[.05]">
                <div className="text-[14px] leading-snug font-medium text-white">{t.title}</div>
                {t.text && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-white/60">{t.text}</p>}
                <div className="mt-1.5 text-[11px] text-fog">
                  <Person handle={t.handle} avatar={t.avatar} className="text-white/70 hover:underline">{t.handle}</Person> · {by.replies(t.id).length} replies · active {ago(by.lastActive(t))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : tab === 'memory' ? (
        memories.length === 0 ? (
          <ul>
            <Empty text={TABS[3].empty} />
          </ul>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {memories.map((m) => (
              <button key={m.id} onClick={() => setViewing(m)} className="group relative aspect-square overflow-hidden rounded-xl bg-white/[.04] ring-1 ring-white/10" aria-label={`Memory by ${m.handle}, ${ago(m.createdAt)}`}>
                <img src={m.thumb} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[9.5px] text-white/85">{m.handle}</span>
              </button>
            ))}
          </div>
        )
      ) : tab === 'note' ? (
        <ul className="space-y-3">
          {by.note.length === 0 && <Empty text={TABS[1].empty} />}
          {by.note.map((c) => (
            <PostRow key={c.id} c={c} />
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          {by.job.length === 0 && <Empty text={TABS[2].empty} />}
          {by.job.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}

      {/* ── composer (location-gated for every kind) */}
      <div className="sticky bottom-0 -mx-5 mt-4 border-t hairline bg-[var(--sheet-foot)] px-5 pt-4">
        {here && tab === 'memory' && !topic ? (
          <button
            onClick={() => setCamera(true)}
            disabled={lim.hexTaken || !lim.left}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#9945ff] to-[#14f195] py-3 text-[14px] font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {lim.hexTaken ? 'You saved a memory here' : !lim.left ? 'Back tomorrow' : 'Capture a memory'}
          </button>
        ) : here ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="space-y-2"
          >
            {(tab === 'topic' || tab === 'job') && !topic && (
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} placeholder={tab === 'topic' ? 'Topic title' : 'Job title, e.g. Help carry DJ gear'} aria-label="Title" />
            )}
            <div className="flex gap-2">
              {tab === 'job' && !topic ? (
                <>
                  <input className="input" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} maxLength={500} placeholder="Details: when, how long" aria-label="Job details" />
                  <div className="relative w-[118px] shrink-0">
                    <input className="input pr-12" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="40" aria-label="Pay in USDC" />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] tracking-widest text-fog">USDC</span>
                  </div>
                </>
              ) : (
                <input
                  className="input"
                  value={f.text}
                  onChange={(e) => setF({ ...f, text: e.target.value })}
                  maxLength={topic ? 500 : tab === 'topic' ? 500 : 280}
                  placeholder={topic ? 'Reply to this topic…' : tab === 'topic' ? 'What do you want to talk about? (optional)' : 'Leave a note in this hex…'}
                  aria-label={topic ? 'Reply' : tab === 'topic' ? 'Topic text' : 'Comment'}
                />
              )}
              {!(tab === 'job' && !topic) && (
                <button className="btn-ember shrink-0" disabled={busy || (tab === 'topic' && !topic ? !f.title.trim() : !f.text.trim())}>
                  {busy ? '…' : topic ? 'Reply' : tab === 'topic' ? 'Start' : 'Drop'}
                </button>
              )}
            </div>
            {tab === 'job' && !topic && (
              <button className="btn-ember w-full" disabled={busy || !f.title.trim() || !f.price}>
                {busy ? '…' : !wallet ? 'Connect a wallet to post a job' : f.price ? `Post job · ${f.price} USDC` : 'Post job'}
              </button>
            )}
          </form>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center">
            <div className="text-[14px] font-medium text-white">🔒 You must be here to post.</div>
            <p className="mt-1 text-[12px] text-fog">
              {pos ? `You're ${fmtKm(dist!)} away${pos.source === 'teleport' ? ' (teleported)' : ''}.` : 'Verify your location to post topics, notes and jobs here.'}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              {!pos && geo !== 'denied' && geo !== 'unavailable' && (
                <button className="btn-ghost text-[13px]" onClick={() => locate()}>
                  {geo === 'asking' ? 'Locating…' : 'Verify location'}
                </button>
              )}
              <button className="btn-ghost text-[13px]" onClick={teleportHere}>
                Teleport here · demo
              </button>
            </div>
          </div>
        )}
        {err && <p className="mt-2 text-[12px] text-ember">{err}</p>}
        <p className="mt-2 mb-1 text-[10px] text-white/25">
          {tab === 'memory' ? <span className="text-white/[.18]">1 per hex · 3 a day · camera only</span> : tab === 'job' ? 'Paid peer-to-peer in USDC through escrow. Anyone can take a funded job; you must be here to post one.' : 'Your hex is checked on-device and again on the server.'}
        </p>
      </div>

      {camera &&
        createPortal(
        <CameraCapture
          busy={busy}
          onClose={() => setCamera(false)}
          onSave={async (img) => {
            if (!pos) return
            setBusy(true)
            const r = await saveMemory({ cell, lat: pos.lat, lng: pos.lng, handle: me.handle, avatar: me.avatar, ...img })
            setBusy(false)
            if (!r.ok) {
              setCamera(false)
              return setErr(
                r.reason === 'hex_limit' ? 'You already saved a memory in this hex.'
                : r.reason === 'daily_limit' ? 'That’s 3 memories today. Back tomorrow.'
                : r.reason === 'not_here' ? 'Server says you are not in this hex.'
                : r.reason === 'sign_in' ? 'Sign in to save memories.'
                : 'Could not save. Try again.',
              )
            }
            setCamera(false)
            s().award(...REWARD.memory)
          }}
        />,
          document.body,
        )}
      {viewing &&
        createPortal(
        <div className="fixed inset-0 z-[65] flex flex-col bg-black/90 p-3 backdrop-blur-md" onClick={() => setViewing(null)} role="dialog" aria-modal="true" aria-label="Memory">
          <div className="mx-auto flex w-full max-w-[720px] items-center justify-between py-2 text-[12px] text-white/80" onClick={(e) => e.stopPropagation()}>
            <Person handle={viewing.handle} avatar={viewing.avatar} className="flex items-center gap-2">
              <Avatar id={viewing.avatar} handle={viewing.handle} size={22} /> {viewing.handle}
            </Person>
            <span className="text-white/50">{ago(viewing.createdAt)}</span>
          </div>
          <img src={viewing.full} alt={`Memory by ${viewing.handle}`} className="mx-auto min-h-0 w-full max-w-[720px] flex-1 rounded-2xl object-contain" />
          <div className="mx-auto flex w-full max-w-[720px] justify-between py-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={async () => {
                await reportMemory(viewing.id)
                setViewing(null)
                s().toast('Reported · thanks, we’ll review it')
              }}
              className="text-[11.5px] text-white/40 hover:text-white"
            >
              Report
            </button>
            <button onClick={() => setViewing(null)} className="btn-black !rounded-xl !px-4 !py-1.5 text-[12.5px]">
              Close
            </button>
          </div>
        </div>,
          document.body,
        )}
    </Panel>
  )
}

function PostRow({ c }: { c: Comment }) {
  return (
    <li className="flex gap-3">
      <Person handle={c.handle} avatar={c.avatar} className="self-start">
        <Avatar id={c.avatar} handle={c.handle} size={28} />
      </Person>
      <div className="min-w-0">
        <div className="text-[12px] text-fog">
          <Person handle={c.handle} avatar={c.avatar} className="text-white/90 hover:underline">{c.handle}</Person> · {ago(c.createdAt)}
        </div>
        <p className="text-[14px] leading-snug text-white/90">{c.text}</p>
      </div>
    </li>
  )
}

function Empty({ text }: { text: string }) {
  return <li className="list-none py-6 text-center text-[13px] text-fog">{text}</li>
}
