import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { AUTH_DEMO, EMAIL_RE, emailStart, emailVerify, googleStart, googleUrl } from '../lib/auth'
import { connectWallet, openInSolflareApp, solflare, SOLFLARE_DOWNLOAD, SOLFLARE_ICON } from '../lib/wallet'
import Logo from './Logo'
import { reduced } from './bits'

type Step = { k: 'start' } | { k: 'code'; email: string; devCode?: string } | { k: 'google-demo' } | { k: 'wallet' }

const ERR: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  rate_limited: 'Too many codes requested. Wait a minute and try again.',
  email_not_configured: 'Email sign-in isn’t switched on for this server yet.',
  google_not_configured: 'Google sign-in isn’t switched on for this server yet.',
  invalid_code: 'That code isn’t right.',
  too_many_attempts: 'Too many wrong tries. Request a new code.',
  network: 'Network problem. Check your connection.',
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

const IS_MOBILE = typeof window !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)

/** Sign in / Sign up: Solana wallet, Google, or an email one-time code. No passwords. */
export default function AuthModal() {
  const open = useStore((s) => s.authOpen)
  const setOpen = useStore((s) => s.setAuthOpen)
  const setAccount = useStore((s) => s.setAccount)
  const toast = useStore((s) => s.toast)
  const [step, setStep] = useState<Step>({ k: 'start' })
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const setWallet = useStore((s) => s.setWallet)
  const [email, setEmail] = useState('')
  const [gmail, setGmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    setStep({ k: 'start' })
    setErr(null)
    setCode(['', '', '', '', '', ''])
    if (card.current && !reduced()) gsap.fromTo(card.current, { y: 24, opacity: 0, scale: 0.97, filter: 'blur(8px)' }, { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.6, ease: 'expo.out' })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const done = (handle: string) => toast(`Welcome to OPINION, ${handle}`, 'mint')

  const sendCode = async () => {
    setErr(null)
    if (!EMAIL_RE.test(email.trim())) return setErr(ERR.invalid_email)
    setBusy(true)
    const r = await emailStart(email.trim())
    setBusy(false)
    if (!r.ok) return setErr(r.error === 'rate_limited' && r.retryAfter ? `Too many codes. Try again in ${r.retryAfter}s.` : (ERR[r.error] ?? 'Could not send the code.'))
    setStep({ k: 'code', email: email.trim(), devCode: r.devCode })
    setTimeout(() => boxes.current[0]?.focus(), 50)
  }

  const verify = async (digits = code) => {
    if (step.k !== 'code') return
    const c = digits.join('')
    if (c.length !== 6) return
    setBusy(true)
    setErr(null)
    const r = await emailVerify(step.email, c)
    setBusy(false)
    if (!r.ok) {
      setCode(['', '', '', '', '', ''])
      boxes.current[0]?.focus()
      return setErr((ERR[r.error] ?? 'Could not verify.') + (r.attemptsLeft !== undefined ? ` ${r.attemptsLeft} tries left.` : ''))
    }
    setAccount(r.account)
    done(r.account.handle)
  }

  const typeDigit = (i: number, v: string) => {
    const only = v.replace(/\D/g, '')
    const next = [...code]
    if (only.length > 1) {
      // pasted the whole code
      only.slice(0, 6).split('').forEach((d, k) => (next[k] = d))
      setCode(next)
      if (next.every(Boolean)) verify(next)
      return
    }
    next[i] = only
    setCode(next)
    if (only && i < 5) boxes.current[i + 1]?.focus()
    if (next.every(Boolean)) verify(next)
  }

  const wallet = async (demo = false) => {
    setErr(null)
    // phones: Safari has no wallet extension → open OPINION inside the Solflare app's browser
    if (!demo && !solflare() && IS_MOBILE) return openInSolflareApp()
    if (!demo && !solflare()) return setStep({ k: 'wallet' })
    setBusy(true)
    try {
      const w = await connectWallet({ demo })
      setWallet(w)
      setOpen(false)
      toast(w.kind === 'solflare' ? 'Solflare connected · welcome to OPINION' : 'Demo wallet connected', 'mint')
    } catch {
      setErr('Connection cancelled in the wallet.')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setErr(null)
    if (AUTH_DEMO) return setStep({ k: 'google-demo' })
    // check the server has Google configured before leaving the page (otherwise the user lands on a bare error)
    setBusy(true)
    try {
      const r = await fetch(googleUrl(), { redirect: 'manual', credentials: 'include' })
      if (r.status === 501) return setErr(ERR.google_not_configured)
    } catch {
      /* opaque redirect / network: let the real navigation decide */
    } finally {
      setBusy(false)
    }
    googleStart()
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Sign in or sign up to OPINION">
      <div ref={card} className="glass-strong w-full max-w-[400px] rounded-[26px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <Logo size={20} />
          <button onClick={() => setOpen(false)} aria-label="Close" className="glass-btn grid h-8 w-8 place-items-center !rounded-full !p-0 text-fog">
            ✕
          </button>
        </div>

        {step.k === 'start' && (
          <>
            {/* Sign in · Sign up: same passwordless flow, different welcome */}
            <div className="mt-5 grid grid-cols-2 rounded-xl bg-white/[.04] p-1 ring-1 ring-white/10" role="tablist" aria-label="Sign in or sign up">
              {(['in', 'up'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg py-1.5 text-[12.5px] font-medium transition ${mode === m ? 'bg-white/[.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]' : 'text-fog hover:text-white'}`}
                >
                  {m === 'in' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>
            <h2 className="font-display mt-4 text-[24px] leading-tight font-semibold text-white">{mode === 'in' ? 'Welcome back.' : 'Join the map.'}</h2>
            <p className="mt-1 text-[13px] text-white/55">{mode === 'in' ? 'Pick how you joined. No passwords.' : 'Post, earn $ON and chat. Choose one, no passwords.'}</p>
            <button
              onClick={() => wallet()}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#ffef46] px-4 py-2.5 text-[14px] font-semibold text-[#02050a] shadow-[0_8px_26px_rgba(255,239,70,.22)] transition-[filter,transform] hover:-translate-y-px hover:brightness-105 disabled:opacity-60"
            >
              <img src={SOLFLARE_ICON} alt="" className="h-[22px] w-[22px] rounded-[6px] ring-1 ring-black/15" />
              {busy ? 'Connecting…' : solflare() ? 'Connect Solflare' : IS_MOBILE ? 'Open in Solflare' : 'Connect with Solflare'}
            </button>
            <button onClick={google} className="btn-ghost mt-2 flex w-full items-center justify-center gap-2.5 text-[14px]">
              <GoogleG /> {mode === 'in' ? 'Sign in with Google' : 'Sign up with Google'}
            </button>
            <div className="my-4 flex items-center gap-3 text-[11px] tracking-[0.2em] text-white/30 uppercase">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendCode()
              }}
              className="space-y-2"
              noValidate
            >
              <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" aria-label="Email" />
              <button className="btn-ghost w-full text-[14px]" disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : mode === 'in' ? 'Email me a sign-in code' : 'Sign up with email'}
              </button>
            </form>
          </>
        )}

        {step.k === 'code' && (
          <>
            <h2 className="font-display mt-5 text-[22px] leading-tight font-semibold text-white">Check your email</h2>
            <p className="mt-1 text-[13px] text-white/55">
              We sent a 6-digit code to <b className="text-white/85">{step.email}</b>.
            </p>
            {step.devCode && (
              <div className="mt-3 rounded-xl border border-[#14f195]/30 bg-[#14f195]/[.06] px-3 py-2 font-mono text-[12px] text-[#14f195]">
                DEMO · no email is sent. Your code: <b className="tracking-[0.3em]">{step.devCode}</b>
              </div>
            )}
            <div className="mt-4 flex justify-between gap-2" onPaste={(e) => typeDigit(0, e.clipboardData.getData('text'))}>
              {code.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el
                  }}
                  value={d}
                  onChange={(e) => typeDigit(i, e.target.value)}
                  onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && boxes.current[i - 1]?.focus()}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={6}
                  aria-label={`Digit ${i + 1}`}
                  className="input !w-12 !px-0 text-center font-mono text-[20px]"
                />
              ))}
            </div>
            <button className="btn-ghost mt-4 w-full text-[14px]" disabled={busy || code.some((d) => !d)} onClick={() => verify()}>
              {busy ? 'Checking…' : 'Verify'}
            </button>
            <button className="mt-3 w-full text-center text-[12px] text-fog hover:text-white" onClick={() => setStep({ k: 'start' })}>
              ← Use a different email
            </button>
          </>
        )}

        {step.k === 'wallet' && (
          <>
            <h2 className="font-display mt-5 flex items-center gap-2 text-[22px] font-semibold text-white">
              <img src={SOLFLARE_ICON} alt="" className="h-6 w-6 rounded-[7px]" /> Connect Solflare
            </h2>
            <p className="mt-1 text-[13px] text-white/55">Solflare isn't installed in this browser. Add the extension (or open OPINION in the Solflare app), then come back. Or try it with a demo wallet.</p>
            <a href={SOLFLARE_DOWNLOAD} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2.5 rounded-[14px] bg-[#ffef46] px-4 py-2.5 text-[14px] font-semibold text-[#02050a] hover:brightness-105">
              <img src={SOLFLARE_ICON} alt="" className="h-[22px] w-[22px] rounded-[6px] ring-1 ring-black/15" />
              Get Solflare ↗
            </a>
            <button className="btn-ghost mt-2 w-full text-[14px]" disabled={busy} onClick={() => wallet(true)}>
              Use a demo wallet
            </button>
            <button className="mt-3 w-full text-center text-[12px] text-fog hover:text-white" onClick={() => setStep({ k: 'start' })}>
              ← Other ways to sign in
            </button>
          </>
        )}

        {step.k === 'google-demo' && (
          <>
            <h2 className="font-display mt-5 flex items-center gap-2 text-[22px] font-semibold text-white">
              <GoogleG /> Choose an account
            </h2>
            <p className="mt-1 text-[12px] text-white/50">Demo: real Google sign-in switches on with the backend. Enter any Gmail to simulate it.</p>
            <form
              className="mt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                const a = googleStart(gmail.trim())
                if (!a) return setErr(ERR.invalid_email)
                setAccount(a)
                done(a.handle)
              }}
            >
              <input className="input" type="email" value={gmail} onChange={(e) => setGmail(e.target.value)} placeholder="name@gmail.com" aria-label="Google account email" />
              <button className="btn-ghost w-full text-[14px]" disabled={!gmail.trim()}>
                Continue
              </button>
            </form>
            <button className="mt-3 w-full text-center text-[12px] text-fog hover:text-white" onClick={() => setStep({ k: 'start' })}>
              ← Back
            </button>
          </>
        )}

        {err && <p className="mt-3 text-[12.5px] text-[#ff8a8a]">{err}</p>}
        <p className="mt-5 text-center text-[10.5px] leading-relaxed text-white/30">By continuing you agree to use OPINION respectfully. We only store your email or wallet address and your handle.</p>
      </div>
    </div>
  )
}
