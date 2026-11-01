import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { AUTH_DEMO, logout, submitOpinion } from '../lib/auth'
import { shortCell } from '../lib/h3'
import { reduced } from './bits'

const MIN = 12
const MAX = 280
const ERR: Record<string, string> = {
  invalid_text: `Write at least ${MIN} characters.`,
  invalid_cell: 'Pick a hex on the map first.',
  rate_limited: 'Too many posts from this network. Try again in a minute.',
  network: 'Network problem. Check your connection.',
}

/** True while a new account still owes its first OPINION. */
export const useGateOn = () => useStore((s) => !!s.account && !s.account.opinionAt && s.splashDone)

/**
 * Mandatory last step of registration, played on the map: tap any hex → write an OPINION there → the draw window pops up.
 * It can't be skipped, only signing out leaves it.
 */
export default function OpinionGate() {
  const on = useGateOn()
  const account = useStore((s) => s.account)
  const cell = useStore((s) => s.selectedCell)
  const tab = useStore((s) => s.tab)
  const entered = useStore((s) => s.entered)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (on) useStore.getState().selectCell(null) // the hex is chosen on purpose, not inherited
  }, [on])
  useEffect(() => {
    if (on && tab !== 'explore') useStore.getState().setTab('explore')
  }, [on, tab])
  useEffect(() => {
    if (on && cell && card.current && !reduced()) gsap.fromTo(card.current, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'expo.out' })
  }, [on, !!cell]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!on || !account) return null
  const out = () => logout().then(() => useStore.getState().setAccount(null))

  if (!cell)
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[72px] z-[45] flex justify-center px-3 sm:top-[84px]" role="status" aria-label="Choose a hex">
        <div className="glass-strong pointer-events-auto w-full max-w-[420px] rounded-2xl px-4 py-3 text-center" style={{ background: 'var(--panel-solid)' }}>
          <div className="font-mono text-[10px] tracking-[0.22em] text-fog uppercase">Last step · required</div>
          <div className="font-display mt-0.5 text-[17px] leading-tight font-semibold text-white">{entered ? 'Tap any hex on the map' : 'Choose your city first'}</div>
          <p className="mt-0.5 text-[12.5px] text-white/65">{entered ? 'That is where your OPINION will live.' : 'Then pick a hex and leave your OPINION.'}</p>
          <button onClick={out} className="mt-1 text-[11.5px] text-fog hover:text-white">
            {AUTH_DEMO ? 'Cancel' : 'Sign out instead'}
          </button>
        </div>
      </div>
    )

  const send = async () => {
    setBusy(true)
    setMsg(null)
    const s = useStore.getState()
    const r = await submitOpinion(account, text.trim(), cell)
    setBusy(false)
    if (!r.ok) return setMsg(ERR[r.error] ?? 'Could not post. Try again.')
    if (r.comment) s.addComment(r.comment)
    s.setAccount(r.account)
    await s.loadDraw()
    if (useStore.getState().draw.draw?.status === 'open') s.setDrawOpen(true)
    else s.toast('Your OPINION is live on the map', 'mint')
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[45] flex justify-center px-3 sm:bottom-[calc(var(--dock-h)+14px)]" role="dialog" aria-label="Leave your OPINION">
      <div ref={card} className="glass-strong pointer-events-auto w-full max-w-[420px] rounded-[22px] p-4" style={{ background: 'var(--panel-solid)' }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[19px] leading-tight font-semibold text-white">Leave your OPINION</h2>
          <button onClick={() => useStore.getState().selectCell(null)} className="shrink-0 text-[12px] text-white/70 underline decoration-white/25 hover:text-white">
            Other hex
          </button>
        </div>
        <p className="num mt-0.5 text-[11px] text-fog">Hex {shortCell(cell)} · about anything</p>
        <textarea className="input mt-2 min-h-[84px] resize-none text-[14px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX} placeholder="What do you think, and why?" aria-label="Your OPINION" autoFocus />
        <div className="num mt-1 text-right text-[10.5px] text-fog">{text.trim().length < MIN ? `${MIN - text.trim().length} more to go` : `${MAX - text.length} left`}</div>
        {msg && <p className="mt-1 text-[12px] text-[#ff8a8a]">{msg}</p>}
        <button onClick={send} disabled={busy || text.trim().length < MIN} className="mt-2 w-full rounded-[14px] bg-gradient-to-r from-[#9945ff] to-[#14f195] px-4 py-2.5 text-[14px] font-semibold text-black disabled:opacity-40">
          {busy ? 'Posting…' : 'Post my OPINION'}
        </button>
      </div>
    </div>
  )
}
