import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { AUTH_DEMO, logout, submitOpinion } from '../lib/auth'
import { X_RE } from '../lib/draw'
import { reduced } from './bits'

const MIN = 12
const MAX = 280
const ERR: Record<string, string> = {
  x_taken: 'That X handle is already used by another account.',
  invalid_x_handle: 'Enter your X handle, like @yourname.',
  x_required: 'Enter your X handle to join the draw.',
  invalid_text: `Write at least ${MIN} characters.`,
  rate_limited: 'Too many posts from this network. Try again in a minute.',
  network: 'Network problem. Check your connection.',
}

/** Mandatory last step of registration: one OPINION about anything. It cannot be dismissed, only signing out leaves it. */
export default function OpinionGate() {
  const account = useStore((s) => s.account)
  const draw = useStore((s) => s.draw.draw)
  const savedX = useStore((s) => s.draw.me?.xHandle ?? '')
  const city = useStore((s) => s.city)
  const [text, setText] = useState('')
  const [x, setX] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const show = !!account && !account.opinionAt

  useEffect(() => {
    if (show && card.current && !reduced()) gsap.fromTo(card.current, { y: 24, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: 'expo.out' })
  }, [show])

  if (!show) return null
  const live = draw?.status === 'open'
  const handle = (x || savedX).trim().replace(/^@/, '').toLowerCase()
  const needX = live && !savedX
  const ready = text.trim().length >= MIN && (!needX || X_RE.test(handle))

  const send = async () => {
    setBusy(true)
    setMsg(null)
    const s = useStore.getState()
    const r = await submitOpinion(account, text.trim(), city.id, needX ? handle : undefined)
    setBusy(false)
    if (!r.ok) return setMsg(ERR[r.error] ?? 'Could not post. Try again.')
    s.setAccount(r.account)
    await s.loadDraw()
    if (useStore.getState().draw.me?.entered) s.setDrawOpen(true)
    else s.toast(`Your OPINION is live in ${city.name}`, 'mint')
  }

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/80 px-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Leave your OPINION">
      <div ref={card} className="glass-strong w-full max-w-[420px] rounded-[26px] p-6" style={{ background: 'var(--panel-solid)' }}>
        <div className="font-mono text-[10px] tracking-[0.22em] text-fog uppercase">Last step · required</div>
        <h2 className="font-display mt-1 text-[24px] leading-tight font-semibold text-white">Leave your OPINION.</h2>
        <p className="mt-1 text-[13px] leading-snug text-white/65">
          About anything. It goes live on the {city.name} map under your handle.
          {live && (
            <>
              {' '}
              It also enters you in the draw for <b className="text-white">{draw.prize}</b>.
            </>
          )}
        </p>
        <textarea
          className="input mt-4 min-h-[96px] resize-none text-[14px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX}
          placeholder="What do you think, and why?"
          aria-label="Your OPINION"
          autoFocus
        />
        <div className="num mt-1 text-right text-[10.5px] text-fog">
          {text.trim().length < MIN ? `${MIN - text.trim().length} more to go` : `${MAX - text.length} left`}
        </div>
        {needX && draw && (
          <div className="mt-2">
            <a href={`https://x.com/${draw.xAccount}`} target="_blank" rel="noreferrer" className="text-[12.5px] text-white underline decoration-white/30">
              𝕏 Follow @{draw.xAccount} ↗
            </a>
            <input className="input mt-2 text-[13px]" value={x} onChange={(e) => setX(e.target.value)} placeholder="@your X handle" aria-label="Your X handle" autoCapitalize="none" autoCorrect="off" />
          </div>
        )}
        {msg && <p className="mt-2 text-[12px] text-[#ff8a8a]">{msg}</p>}
        <button onClick={send} disabled={busy || !ready} className="mt-3 w-full rounded-[14px] bg-gradient-to-r from-[#9945ff] to-[#14f195] px-4 py-2.5 text-[14px] font-semibold text-black disabled:opacity-40">
          {busy ? 'Posting…' : live ? 'Post my OPINION and enter' : 'Post my OPINION'}
        </button>
        <button onClick={() => logout().then(() => useStore.getState().setAccount(null))} className="mt-3 w-full text-center text-[12px] text-fog hover:text-white">
          {AUTH_DEMO ? 'Cancel' : 'Sign out instead'}
        </button>
      </div>
    </div>
  )
}
