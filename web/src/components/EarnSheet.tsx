import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { LIVE } from '../lib/api'
import { ago } from '../lib/format'
import { TERMS, TERMS_VERSION, TIER_INFO, coarseCell, deleteMine, describe, exportMine, readLog, record, sendConsent, withdrawConsent, type Tier } from '../lib/earn'
import { reduced } from './bits'

const ORDER: Tier[] = ['presence', 'observations', 'interests']

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-10 shrink-0 rounded-full border transition ${on ? 'border-[#14f195]/60 bg-[#14f195]/25' : 'border-white/15 bg-white/[.06]'}`}
    >
      <span className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${on ? 'left-[19px] bg-[#14f195] shadow-[0_0_10px_#14f195]' : 'left-[3px] bg-white/60'}`} />
    </button>
  )
}

/** Earn mode: plain-language consent → per-tier switches → My data (export / delete / pause / stop). */
export default function EarnSheet() {
  const open = useStore((s) => s.earnOpen)
  const setOpen = useStore((s) => s.setEarnOpen)
  const consent = useStore((s) => s.earnConsent)
  const paused = useStore((s) => s.earnPaused)
  const points = useStore((s) => s.earnPoints)
  const account = useStore((s) => s.account)
  const [tiers, setTiers] = useState<Record<Tier, boolean>>({ presence: true, observations: true, interests: false })
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setMsg(null)
    setConfirmDel(false)
    setAgree(false)
    if (consent) setTiers(consent.tiers)
    if (card.current && !reduced()) gsap.fromTo(card.current, { y: 24, opacity: 0, scale: 0.97, filter: 'blur(8px)' }, { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.55, ease: 'expo.out' })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const log = useMemo(() => (open ? readLog() : []), [open, points, msg])
  if (!open) return null
  const s = useStore.getState()
  const anyTier = ORDER.some((t) => tiers[t])

  const start = async (next = tiers) => {
    if (LIVE && !account) {
      setOpen(false)
      s.setAuthOpen(true)
      return
    }
    setBusy(true)
    const c = { version: TERMS_VERSION, tiers: next, at: Date.now() }
    const r = await sendConsent(c)
    setBusy(false)
    if (!r.ok) return setMsg(r.error === 'terms_changed' ? 'The terms were updated. Reload to read the new version.' : 'Could not save your consent. Try again.')
    s.setEarnConsent({ ...c, receipt: r.receipt })
    s.toast(consent ? 'Earn settings updated' : 'Earn mode on · thank you', 'mint')
  }
  const stop = async () => {
    await withdrawConsent()
    s.setEarnConsent(null)
    s.toast('Earn mode stopped · nothing more is shared')
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-3 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Earn mode">
      <div ref={card} className="glass-strong scroll-thin max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-[26px] p-5" style={{ background: 'var(--panel-solid)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] text-fog uppercase">{consent ? (paused ? 'Earn · paused' : 'Earn · on') : 'Earn mode · opt-in'}</div>
            <h2 className="font-display mt-1 text-[22px] leading-tight font-semibold text-white">{consent ? 'My data' : 'Get paid for what you share'}</h2>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="glass-btn grid h-8 w-8 shrink-0 place-items-center !rounded-full !p-0 text-fog">
            ✕
          </button>
        </div>

        {!LIVE && (
          <div className="mt-3 rounded-xl border border-[#14f195]/25 bg-[#14f195]/[.06] px-3 py-2 text-[11.5px] leading-snug text-[#14f195]">
            Preview: everything stays in this browser. Nothing is sent or sold.
          </div>
        )}

        {consent && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [points.toLocaleString(), 'points earned'],
              [log.length.toString(), 'contributions'],
              [ago(consent.at), 'agreed'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/[.04] py-2 ring-1 ring-white/10">
                <div className="num text-[15px] font-semibold text-white">{v}</div>
                <div className="font-mono text-[8.5px] tracking-[0.1em] text-fog uppercase">{l}</div>
              </div>
            ))}
          </div>
        )}

        {!consent && (
          <ul className="mt-4 space-y-1.5">
            {TERMS.map((t) => (
              <li key={t} className="flex gap-2 text-[12.5px] leading-snug text-white/75">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/50" />
                {t}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 font-mono text-[10px] tracking-[0.18em] text-fog uppercase">What you share</div>
        <div className="mt-2 space-y-2">
          {ORDER.map((t) => (
            <div key={t} className="flex items-start gap-3 rounded-2xl bg-white/[.03] p-3 ring-1 ring-white/[.08]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-white">
                  {TIER_INFO[t].title}
                  <span className="rounded bg-[#14f195]/12 px-1.5 py-px font-mono text-[9px] text-[#14f195]">{TIER_INFO[t].earn}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-white/55">{TIER_INFO[t].what}</p>
              </div>
              <Toggle
                on={tiers[t]}
                label={`Share ${TIER_INFO[t].title}`}
                onClick={() => {
                  const next = { ...tiers, [t]: !tiers[t] }
                  setTiers(next)
                  // already earning: a change is a new consent record (turning everything off = stop)
                  if (consent) (ORDER.some((k) => next[k]) ? start(next) : stop())
                }}
              />
            </div>
          ))}
        </div>

        {!consent ? (
          <>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[12px] leading-snug text-white/70">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#14f195]" />
              <span>
                I've read this and agree to share the tiers I switched on, under Earn terms <span className="font-mono text-white/50">{TERMS_VERSION}</span>. I'm 18 or older.
              </span>
            </label>
            <button
              disabled={!agree || !anyTier || busy}
              onClick={() => start()}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] py-2.5 text-[13.5px] font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
            >
              {busy ? 'Saving…' : LIVE && !account ? 'Sign in to start earning' : 'Start earning'}
            </button>
            <button onClick={() => setOpen(false)} className="mt-2 w-full text-center text-[12px] text-fog hover:text-white">
              Not now
            </button>
          </>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              <button onClick={() => s.setEarnPaused(!paused)} className="btn-black flex-1 !rounded-xl !py-2 text-[12.5px]">
                {paused ? '▶ Resume' : '❚❚ Pause'}
              </button>
              <button onClick={() => exportMine(consent)} className="btn-black flex-1 !rounded-xl !py-2 text-[12.5px]">
                ⤓ Export
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              {confirmDel ? (
                <button
                  onClick={async () => {
                    await deleteMine()
                    await stop()
                    setConfirmDel(false)
                    s.toast('Your Earn data was deleted')
                  }}
                  className="flex-1 rounded-xl border border-[#ff5a5a]/50 bg-[#ff5a5a]/15 py-2 text-[12.5px] font-medium text-[#ff8a8a]"
                >
                  Yes, delete everything
                </button>
              ) : (
                <button onClick={() => setConfirmDel(true)} className="btn-black flex-1 !rounded-xl !py-2 text-[12.5px] !text-[#ff8a8a]">
                  Delete my data
                </button>
              )}
              <button onClick={stop} className="btn-black flex-1 !rounded-xl !py-2 text-[12.5px]">
                Stop earning
              </button>
            </div>
            <div className="mt-4 font-mono text-[10px] tracking-[0.18em] text-fog uppercase">Latest contributions</div>
            {log.length ? (
              <ul className="mt-2 space-y-1">
                {[...log].reverse().slice(0, 12).map((e, i) => (
                  <li key={i} className="flex justify-between gap-2 text-[11.5px] text-white/70">
                    <span className="truncate">{describe(e)}</span>
                    <span className="shrink-0 text-fog">{ago(e.t)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11.5px] text-fog">Nothing yet. Turn on location (Centre) or answer a prompt.</p>
            )}
            {consent.receipt && <p className="mt-3 font-mono text-[9.5px] break-all text-white/30">Consent receipt {consent.receipt}</p>}
          </>
        )}
        {msg && <p className="mt-3 text-[12px] text-[#ff8a8a]">{msg}</p>}
        <p className="mt-4 text-center text-[10px] leading-relaxed text-white/30">
          Aggregates only · 50+ people · noise · 24 h delay · raw data deleted after 90 days. Rewards convert to $ON each epoch (devnet).
        </p>
      </div>
    </div>
  )
}

/** Small occasional prompt while earning with Observations: "How busy is it here?" (1–5). */
export function BusyPrompt() {
  const consent = useStore((s) => s.earnConsent)
  const paused = useStore((s) => s.earnPaused)
  const pos = useStore((s) => s.pos)
  const tab = useStore((s) => s.tab)
  const cell = useStore((s) => s.selectedCell)
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = !!consent?.tiers.observations && !paused && !!pos
  useEffect(() => {
    if (!active) return setShow(false)
    const last = Number(localStorage.getItem('opinion:busyAt') ?? 0)
    const wait = Math.max(20_000, last + 15 * 60_000 - Date.now()) // at most every 15 min
    const t = setTimeout(() => setShow(true), wait)
    return () => clearTimeout(t)
  }, [active, show])
  useEffect(() => {
    if (show && ref.current && !reduced()) gsap.fromTo(ref.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out' })
  }, [show])
  if (!show || !active || tab !== 'explore' || cell) return null
  const answer = (v: number | null) => {
    try {
      localStorage.setItem('opinion:busyAt', String(Date.now()))
    } catch {
      /* private mode */
    }
    setShow(false)
    const s = useStore.getState()
    if (v && s.pos) {
      record({ tier: 'observations', kind: 'busy', cell: coarseCell(s.pos.lat, s.pos.lng), t: Date.now(), value: v })
      s.addEarnPoints(10, 'thanks for the answer')
    }
  }
  return (
    <div ref={ref} className="glass-strong pointer-events-auto absolute bottom-[calc(var(--dock-h)+14px)] left-1/2 z-30 w-[268px] -translate-x-1/2 rounded-2xl p-3" style={{ background: 'var(--panel-solid)' }} role="dialog" aria-label="Quick question">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-white">How busy is it around you?</span>
        <button onClick={() => answer(null)} className="text-[11px] text-fog hover:text-white" aria-label="Skip">
          ✕
        </button>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} onClick={() => answer(v)} className="rounded-lg bg-white/[.05] py-1.5 text-[12px] text-white ring-1 ring-white/10 hover:bg-white/[.1]" aria-label={`Busy ${v} of 5`}>
            {['😴', '🙂', '😐', '😮', '🔥'][v - 1]}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-fog uppercase">
        <span>quiet</span>
        <span>+10 pts</span>
        <span>packed</span>
      </div>
    </div>
  )
}
