import { useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore, type Lighting } from '../store'
import { CITIES } from '../data/mock'
import { disconnectWallet, SOLFLARE_ICON } from '../lib/wallet'
import { short } from '../lib/format'
import { Avatar, Ticker } from './bits'
import Logo from './Logo'

const LIGHTS: { id: Lighting; label: string; dot: string }[] = [
  { id: 'midnight', label: 'Midnight', dot: '#e8e8ee' },
  { id: 'neon', label: 'Neon', dot: '#b26bff' },
  { id: 'dusk', label: 'Dusk', dot: '#ff5a1f' },
]

export default function TopBar() {
  const ui = useStore((s) => s.ui)
  const city = useStore((s) => s.city)
  const enterCity = useStore((s) => s.enterCity)
  const goWorld = useStore((s) => s.goWorld)
  const entered = useStore((s) => s.entered)
  const lighting = useStore((s) => s.lighting)
  const setLighting = useStore((s) => s.setLighting)
  const me = useStore((s) => s.me)
  const setTab = useStore((s) => s.setTab)
  const [cityOpen, setCityOpen] = useState(false)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 md:p-4">
      <div className="pointer-events-auto flex items-center gap-2">
        <div className="glass flex h-11 items-center gap-2 rounded-2xl pr-1 pl-3 sm:gap-3 sm:pr-2 sm:pl-4">
          <Logo size={17} intro />
          <span className="h-4 w-px bg-white/10" />
          <div className="relative">
            <button onClick={() => setCityOpen((o) => !o)} className="flex items-center gap-1.5 rounded-xl px-2 py-1 text-[13px] whitespace-nowrap text-white/80 hover:bg-white/5" aria-expanded={cityOpen}>
              {entered ? city.name : '🌍 World'}
              <span className="text-[9px] text-fog">▼</span>
            </button>
            {cityOpen && (
              <div className="glass-strong absolute top-10 left-0 w-56 overflow-hidden rounded-2xl p-1.5">
                {CITIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      enterCity(c.id)
                      setCityOpen(false)
                    }}
                    className={`flex w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-white/5 ${entered && c.id === city.id ? 'bg-white/5' : ''}`}
                  >
                    <span className="text-[13px] text-white">{c.name}</span>
                    <span className="text-[11px] text-fog">{c.district}</span>
                  </button>
                ))}
                <button
                  onClick={() => {
                    goWorld()
                    setCityOpen(false)
                  }}
                  className={`mt-1 flex w-full items-center gap-2 rounded-xl border-t border-white/10 px-3 py-2 text-left hover:bg-white/5 ${entered ? '' : 'bg-white/5'}`}
                >
                  <span className="text-[13px] text-white">🌍 World view</span>
                  <span className="text-[11px] text-fog">zoom out to the world map</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <Stats />
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <EarnButton />
        <DrawButton />
        <div className={`glass hidden h-11 items-center gap-1 rounded-2xl px-1.5 ${ui === 'light' ? '' : 'md:flex'}`} role="radiogroup" aria-label="Lighting">
          {LIGHTS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={lighting === l.id}
              onClick={() => setLighting(l.id)}
              title={l.label}
              className={`flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12px] transition ${lighting === l.id ? 'text-white ring-1 ring-white/20 bg-gradient-to-b from-white/[.14] to-white/[.03] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,.18)]' : 'text-fog hover:text-white'}`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.dot, boxShadow: `0 0 8px ${l.dot}` }} />
              {l.label}
            </button>
          ))}
        </div>
        <ThemeCube />
        <AuthButton />
        <button onClick={() => setTab('account')} className="glass-btn grid h-11 w-11 place-items-center !rounded-2xl !p-0" aria-label="Account">
          <Avatar id={me.avatar} handle={me.handle} size={28} />
        </button>
      </div>
    </div>
  )
}

function Stats() {
  const points = useStore((s) => s.points)
  const visited = useStore((s) => s.visited.length)
  const coverage = Math.min(100, (visited / 721) * 100) // 721 = res-10 hexes in a k=15 disk ≈ your district
  return (
    <div className="glass hidden h-11 items-center gap-4 rounded-2xl px-4 lg:flex">
      <Stat label="pts" value={<Ticker value={points} />} />
      <Stat label="hexes" value={<Ticker value={visited} />} />
      <Stat label="coverage" value={<><Ticker value={coverage} decimals={1} />%</>} />
    </div>
  )
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="num text-[15px] font-semibold text-white">{value}</span>
      <span className="text-[10px] tracking-[0.16em] text-fog uppercase">{label}</span>
    </div>
  )
}

/** Earn mode entry: off → "Earn"; on → points ticking; paused → dim. Opens the consent / My data sheet. */
function EarnButton() {
  const consent = useStore((s) => s.earnConsent)
  const paused = useStore((s) => s.earnPaused)
  const pts = useStore((s) => s.earnPoints)
  const open = useStore((s) => s.setEarnOpen)
  const on = !!consent && !paused
  return (
    <button
      onClick={() => open(true)}
      className={`glass-btn flex h-9 min-w-9 items-center justify-center gap-2 !rounded-xl !px-2 !py-0 text-[12px] font-medium sm:h-11 sm:!rounded-2xl sm:!px-3.5 ${on ? '!border-[#14f195]/40' : ''}`}
      aria-label={consent ? (paused ? 'Earn mode paused · open my data' : `Earning · ${pts} points · open my data`) : 'Earn: opt in to share data for rewards'}
      title={consent ? (paused ? 'Earn paused' : 'Earn on · My data') : 'Earn · opt-in'}
    >
      <span className={`live-dot ${on ? '' : ''}`} style={on ? { background: '#14f195', boxShadow: '0 0 10px #14f195' } : { background: paused ? '#aa8' : '#555', boxShadow: 'none', animation: 'none' }} />
      <span className="hidden whitespace-nowrap sm:inline">{consent ? (paused ? 'Earn paused' : <>Earning · <span className="num">{pts.toLocaleString()}</span></>) : 'Earn'}</span>
    </button>
  )
}

/** 🎁 Hex lottery pill: shown while a draw exists; pulses until you've entered. */
function DrawButton() {
  const draw = useStore((s) => s.draw.draw)
  const entered = useStore((s) => !!s.draw.me?.entered)
  const open = useStore((s) => s.setDrawOpen)
  if (!draw) return null
  const live = draw.status === 'open'
  return (
    <button
      onClick={() => open(true)}
      className={`glass-btn flex h-9 min-w-9 items-center justify-center gap-1.5 !rounded-xl !px-2 !py-0 text-[12px] font-medium sm:h-11 sm:!rounded-2xl sm:!px-3 ${live && !entered ? '!border-[#9945ff]/50' : ''}`}
      aria-label={draw.status === 'drawn' ? 'Hex lottery: see the winner' : entered ? 'Hex lottery: you are in' : `Hex lottery: win ${draw.prize}`}
      title={draw.title}
    >
      <span className="relative text-[15px] leading-none">
        🎁
        {live && !entered && <span className="live-dot absolute -top-0.5 -right-1 !h-1.5 !w-1.5" style={{ background: '#9945ff', boxShadow: '0 0 8px #9945ff' }} />}
      </span>
      <span className="hidden whitespace-nowrap sm:inline">{draw.status === 'drawn' ? 'Winner' : entered ? 'You’re in' : 'Win a card'}</span>
    </button>
  )
}

/** One entry point: signed out → "Sign in / Sign up" (wallet, Google or email inside). Wallet connected → its pill. */
function AuthButton() {
  const account = useStore((s) => s.account)
  const wallet = useStore((s) => s.wallet)
  const open = useStore((s) => s.setAuthOpen)
  if (wallet) return <WalletPill />
  if (account) return null // signed in: the avatar button opens the account
  return (
    <button onClick={() => open(true)} className="btn-black flex h-11 min-w-11 items-center justify-center gap-2 !rounded-2xl !px-3 !py-0 text-[13px]" aria-label="Sign in or sign up">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4.2 4.3-6.5 8-6.5s7 2.3 8 6.5" />
      </svg>
      <span className="hidden whitespace-nowrap sm:inline">Sign in / Sign up</span>
    </button>
  )
}

function WalletPill() {
  const wallet = useStore((s) => s.wallet)
  const setWallet = useStore((s) => s.setWallet)
  const toast = useStore((s) => s.toast)
  if (!wallet) return null
  return (
    <button
      onClick={async () => {
        await disconnectWallet()
        setWallet(null)
        toast('Wallet disconnected')
      }}
      className="glass group flex h-11 items-center gap-2 rounded-2xl px-3.5 text-[12px]"
      title="Disconnect"
    >
      {wallet.kind === 'solflare' ? <img src={SOLFLARE_ICON} alt="Solflare" className="h-[18px] w-[18px] rounded-[5px]" /> : <span className="h-2 w-2 rounded-full bg-mint shadow-[0_0_8px_#3dffa8]" />}
      <span className="num text-white group-hover:hidden">{short(wallet.address)}</span>
      <span className="hidden text-fog group-hover:inline">Disconnect</span>
      {wallet.kind === 'mock' && <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] tracking-widest text-fog uppercase">demo</span>}
    </button>
  )
}

const THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
] as const

/** Small square: tap to cycle Dark → Light → System. The icon morphs with a little spin. */
function ThemeCube() {
  const pref = useStore((s) => s.themePref)
  const setPref = useStore((s) => s.setThemePref)
  const ref = useRef<HTMLButtonElement>(null)
  const i = THEMES.findIndex((t) => t.id === pref)
  const next = THEMES[(i + 1) % THEMES.length]!
  const cycle = () => {
    setPref(next.id)
    const icon = ref.current?.querySelector('svg')
    if (icon && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(icon, { rotate: -120, scale: 0.6, opacity: 0 }, { rotate: 0, scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' })
  }
  return (
    <button
      ref={ref}
      onClick={cycle}
      className="glass-btn grid h-9 w-9 shrink-0 place-items-center !rounded-xl !p-0 sm:h-11 sm:w-11 sm:!rounded-2xl"
      aria-label={`Appearance: ${THEMES[i]?.label ?? 'Dark'} — switch to ${next.label}`}
      title={`${THEMES[i]?.label ?? 'Dark'} · tap for ${next.label}`}
    >
      <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {pref === 'dark' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        ) : pref === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
          </>
        ) : (
          <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
            <path d="M12 7v6a3 3 0 0 0 0-6z" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </button>
  )
}
