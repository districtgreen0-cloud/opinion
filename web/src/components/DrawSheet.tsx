import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { LIVE } from '../lib/api'
import { cellCenter } from '../lib/h3'
import { proofUrl, setXHandle, X_RE } from '../lib/draw'
import { reduced } from './bits'

const left = (t: number) => {
  const ms = t - Date.now()
  if (ms <= 0) return 'closed'
  const d = Math.floor(ms / 864e5)
  const h = Math.floor((ms % 864e5) / 36e5)
  const m = Math.floor((ms % 36e5) / 6e4)
  return d ? `${d}d ${h}h left` : h ? `${h}h ${m}m left` : `${m}m left`
}
const short = (h?: string | null) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—')

/** 🎁 Hex lottery: three steps (sign up · follow on X · post an opinion), live countdown, then the verifiable result. */
export default function DrawSheet() {
  const open = useStore((s) => s.drawOpen)
  const setOpen = useStore((s) => s.setDrawOpen)
  const { draw, me } = useStore((s) => s.draw)
  const account = useStore((s) => s.account)
  const [x, setX] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [verify, setVerify] = useState(false)
  const [, tick] = useState(0)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setMsg(null)
    setVerify(false)
    setX(me?.xHandle ?? '')
    useStore.getState().loadDraw()
    if (card.current && !reduced()) gsap.fromTo(card.current, { y: 24, opacity: 0, scale: 0.97, filter: 'blur(8px)' }, { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.55, ease: 'expo.out' })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', esc)
    const t = setInterval(() => tick((v) => v + 1), 30_000)
    return () => {
      removeEventListener('keydown', esc)
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const s = useStore.getState()
  const signed = !LIVE || !!account
  const hasX = !!me?.xHandle
  const entered = !!me?.entered
  const live = draw?.status === 'open'
  const xLink = `https://x.com/${draw?.xAccount ?? 'useopinion'}`

  const saveX = async () => {
    setBusy(true)
    setMsg(null)
    const r = await setXHandle(x)
    setBusy(false)
    if (!r.ok) {
      if (r.reason === 'sign_in') return s.setAuthOpen(true)
      return setMsg(r.reason === 'taken' ? 'That X handle is already used by another account.' : r.reason === 'invalid' ? 'Enter your X handle, like @yourname.' : 'Could not save. Try again.')
    }
    setX(r.xHandle)
    await s.loadDraw()
  }
  const showHex = (cell: string) => {
    const [lng, lat] = cellCenter(cell)
    s.flyTo(lng, lat, 16.8)
    s.selectCell(cell)
    setOpen(false)
  }

  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) => (
    <div className={`flex gap-3 rounded-2xl border p-3 ${done ? 'border-[#14f195]/30 bg-[#14f195]/[.05]' : 'border-white/10 bg-white/[.03]'}`}>
      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${done ? 'bg-[#14f195] text-black' : 'bg-white/10 text-white/70'}`}>{done ? '✓' : n}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-white">{title}</div>
        {children}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-3 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Hex lottery">
      <div ref={card} className="glass-strong scroll-thin max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-[26px] p-5" style={{ background: 'var(--panel-solid)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] text-fog uppercase">🎁 Hex lottery{draw ? ` · ${draw.status === 'drawn' ? 'drawn' : left(draw.endsAt)}` : ''}</div>
            <h2 className="font-display mt-1 text-[22px] leading-tight font-semibold text-white">{draw?.title ?? 'Win a card'}</h2>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="glass-btn grid h-8 w-8 shrink-0 place-items-center !rounded-full !p-0 text-fog">
            ✕
          </button>
        </div>

        {!draw ? (
          <p className="mt-3 text-[13px] leading-relaxed text-white/75">
            {LIVE ? 'No draw is running right now. Follow ' : 'In the live app you sign up, follow '}
            <a href={xLink} target="_blank" rel="noreferrer" className="text-white underline decoration-white/30">
              @{draw ? '' : 'useopinion'} on X
            </a>{' '}
            {LIVE ? 'to hear about the next one.' : 'and post an opinion in a hex. One person is picked by a public, verifiable draw and wins a card.'}
          </p>
        ) : draw.status === 'drawn' ? (
          <>
            <div className="mt-3 rounded-2xl border border-[#14f195]/30 bg-gradient-to-br from-[#9945ff]/15 to-[#14f195]/10 p-4">
              <div className="font-mono text-[10px] tracking-[0.2em] text-[#14f195] uppercase">{me?.won ? 'You won' : 'Winner'}</div>
              <div className="mt-1 text-[20px] font-semibold text-white">{draw.winner?.handle ?? '—'}</div>
              <div className="text-[12px] text-white/60">
                @{draw.winner?.xHandle} · prize: {draw.prize}
              </div>
              {draw.winner?.cell && (
                <button onClick={() => showHex(draw.winner!.cell)} className="btn-black mt-3 !rounded-xl !px-3 !py-1.5 text-[12px]">
                  Show the winning hex →
                </button>
              )}
              {me?.won && <p className="mt-2 text-[12px] text-[#14f195]">Check your email: we need a reply from your X account to confirm and deliver.</p>}
            </div>
            <div className="num mt-3 text-[11.5px] text-fog">
              {draw.entriesCount} entries · picked #{draw.winnerIndex}
            </div>
            <button onClick={() => setVerify((v) => !v)} className="mt-2 text-[12px] text-white/70 underline decoration-white/25 hover:text-white" aria-expanded={verify}>
              {verify ? 'Hide' : 'Verify this draw'}
            </button>
            {verify && (
              <div className="mt-2 space-y-1.5 rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[10.5px] leading-snug text-white/70 [overflow-wrap:anywhere]">
                <div>
                  <span className="text-fog">commit </span>sha256(seed) = {short(draw.commitHash)}
                </div>
                <div>
                  <span className="text-fog">seed </span>
                  {short(draw.seed)}
                </div>
                <div>
                  <span className="text-fog">anchor </span>Solana block {short(draw.anchor)}
                </div>
                <div>
                  <span className="text-fog">entries root </span>
                  {short(draw.entriesRoot)}
                </div>
                <div>
                  <span className="text-fog">winner </span>sha256(seed ‖ root ‖ anchor) mod {draw.entriesCount} = {draw.winnerIndex}
                </div>
                <a href={proofUrl(draw.id)} target="_blank" rel="noreferrer" className="block pt-1 text-white underline decoration-white/30">
                  Full proof + recipe ↗
                </a>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-white/75">
              Prize: <b className="text-white">{draw.prize}</b>. One entry per person. The winner is picked by a public draw anyone can recompute (commitment{' '}
              {draw.commitHash ? <span className="num text-white/60">{short(draw.commitHash)}</span> : 'published before entries close'}).
            </p>
            <div className="mt-4 space-y-2">
              <Step n={1} done={signed} title="Sign up">
                {!signed && (
                  <button onClick={() => (setOpen(false), s.setAuthOpen(true))} className="btn-black mt-2 !rounded-xl !px-3 !py-1.5 text-[12px]">
                    Sign in / Sign up
                  </button>
                )}
              </Step>
              <Step n={2} done={hasX} title={`Follow @${draw.xAccount} on X`}>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={xLink} target="_blank" rel="noreferrer" className="btn-black !rounded-xl !px-3 !py-1.5 text-[12px]">
                    𝕏 Follow @{draw.xAccount} ↗
                  </a>
                  {!hasX && (
                    <>
                      <input
                        className="input !w-auto min-w-0 flex-1 !py-1.5 text-[12.5px]"
                        placeholder="@your X handle"
                        value={x}
                        onChange={(e) => setX(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveX()}
                        aria-label="Your X handle"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                      <button onClick={saveX} disabled={busy || !X_RE.test(x.trim().replace(/^@/, '').toLowerCase())} className="rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] px-3 py-1.5 text-[12px] font-semibold text-black disabled:opacity-40">
                        Save
                      </button>
                    </>
                  )}
                  {hasX && <span className="text-[12px] text-white/60">@{me?.xHandle}</span>}
                </div>
                {msg && <p className="mt-1.5 text-[11.5px] text-[#ff8a8a]">{msg}</p>}
              </Step>
              <Step n={3} done={entered} title="Post an opinion in any hex">
                {entered ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#14f195]">
                    You’re in · hex {me?.cell?.slice(0, 7)}…
                    {me?.cell && (
                      <button onClick={() => showHex(me.cell!)} className="text-white/70 underline decoration-white/25 hover:text-white">
                        show
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-white/60">Stand somewhere, tap your hex, write at least a sentence (12+ characters). Your first opinion while the draw is open is your entry.</p>
                )}
                {!entered && signed && hasX && live && (
                  <button onClick={() => (setOpen(false), s.toast('Tap the hex you stand in and post your opinion', 'violet'))} className="btn-black mt-2 !rounded-xl !px-3 !py-1.5 text-[12px]">
                    Go to the map →
                  </button>
                )}
              </Step>
            </div>
            <div className="num mt-3 text-[11px] text-fog">
              {draw.entriesCount} {draw.entriesCount === 1 ? 'entry' : 'entries'} so far · ends {new Date(draw.endsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-white/35">The follow is checked by hand before the prize ships. Delivery is arranged by email with the winner. No purchase needed.</p>
          </>
        )}
      </div>
    </div>
  )
}
