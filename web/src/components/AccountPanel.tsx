import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { AVATARS } from '../lib/avatars'
import { short } from '../lib/format'
import type { Vibe } from '../lib/types'
import { Avatar, Panel } from './bits'
import { H3_AREA_LABEL } from '../lib/h3'
import TimelineImport from './TimelineImport'
import { logout, AUTH_DEMO } from '../lib/auth'
import { disconnectWallet } from '../lib/wallet'
import { Person } from './Profile'

const VIBES: { id: Vibe; label: string }[] = [
  { id: 'out', label: '🔥 Out tonight' },
  { id: 'chill', label: '🌙 Chilling' },
  { id: 'looking', label: '👀 Looking for plans' },
]

export default function AccountPanel() {
  const me = useStore((s) => s.me)
  const wallet = useStore((s) => s.wallet)
  const setMe = useStore((s) => s.setMe)
  const s = useStore.getState

  return (
    <Panel kicker="Account" title={me.handle} onClose={() => s().setTab('explore')}>
      <div className="flex items-center gap-4">
        <Avatar id={me.avatar} handle={me.handle} size={64} ring="#ff5a1f" />
        <div className="min-w-0 flex-1">
          <label className="text-[11px] tracking-[0.16em] text-fog uppercase" htmlFor="handle">Handle</label>
          <input
            id="handle"
            className="input mt-1"
            value={me.handle}
            maxLength={20}
            onChange={(e) => setMe({ handle: '@' + e.target.value.replace(/[^a-z0-9._]/gi, '').toLowerCase() })}
          />
        </div>
      </div>

      <SignedIn />
      <Friends />

      <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Avatar</h3>
      <div className="grid grid-cols-8 gap-2">
        {AVATARS.map((a) => (
          <button key={a} onClick={() => setMe({ avatar: a })} aria-label={`Avatar ${a}`} className={`rounded-full transition ${me.avatar === a ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}>
            <Avatar id={a} handle={me.handle} size={36} ring={me.avatar === a ? '#ff5a1f' : undefined} />
          </button>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Vibe</h3>
      <div className="flex flex-wrap gap-2">
        {VIBES.map((v) => (
          <button key={v.id} className="chip" data-on={me.vibe === v.id} onClick={() => setMe({ vibe: v.id })}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl border hairline p-4">
        <div>
          <div className="text-[14px] text-white">Ghost mode</div>
          <div className="text-[12px] text-fog">Hide your dot from friends. You still earn.</div>
        </div>
        <button
          role="switch"
          aria-checked={me.ghost}
          onClick={() => setMe({ ghost: !me.ghost })}
          className={`relative h-7 w-12 rounded-full transition border ${me.ghost ? 'border-white/40 bg-gradient-to-b from-white/[.14] to-white/[.03] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,.18)]' : 'border-white/10 bg-white/[.03] backdrop-blur-md'}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full transition-all ${me.ghost ? 'left-6 bg-white' : 'left-1 bg-white/30'}`} />
        </button>
      </div>

      <div className="mt-3 rounded-2xl border hairline p-4">
        <div className="text-[14px] text-white">Wallet</div>
        <div className="num mt-1 text-[12px] text-fog">{wallet ? `${short(wallet.address)} · ${wallet.kind === 'solflare' ? 'Solflare' : 'demo wallet'}` : 'Not connected — use Sign in / Sign up'}</div>
      </div>

      <div className="mt-3">
        <TimelineImport />
      </div>

      <LogOutFooter />

      <p className="mt-6 text-[11px] leading-relaxed text-white/30">
        OPINION never stores your raw GPS trail. Only the hex you post from is kept ({H3_AREA_LABEL}).
      </p>
    </Panel>
  )
}

/** Log out of everything: the account session and the connected wallet. */
export async function logOutAll() {
  const s = useStore.getState()
  if (s.account) await logout()
  if (s.wallet) await disconnectWallet()
  s.setAccount(null)
  s.setWallet(null)
  s.toast('Logged out · see you soon')
}

function SignedIn() {
  const account = useStore((s) => s.account)
  const wallet = useStore((s) => s.wallet)
  const openAuth = useStore((s) => s.setAuthOpen)
  if (!account && !wallet)
    return (
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4">
        <div className="text-[13px] text-white/70">You're not logged in. Sign in with a wallet, Google or email to keep your handle, posts and $ON.</div>
        <button className="btn-ember mt-3 w-full text-[13.5px]" onClick={() => openAuth(true)}>
          Sign in / Sign up
        </button>
      </div>
    )
  return (
    <div className="mt-5 rounded-2xl border border-[#14f195]/25 bg-[#14f195]/[.04] p-4">
      <div className="font-mono text-[10px] tracking-[0.16em] text-[#14f195] uppercase">
        Logged in{account ? ` · ${account.providers.join(' + ')}` : ''}
        {wallet ? ` · wallet${wallet.kind === 'mock' ? ' (demo)' : ''}` : ''}
        {AUTH_DEMO && account ? ' · demo' : ''}
      </div>
      {account && <div className="mt-1 truncate text-[14px] text-white">{account.email ?? account.name ?? account.handle}</div>}
      {wallet && <div className="num mt-1 truncate text-[13px] text-white/80">◎ {short(wallet.address)}</div>}
      <div className="mt-3 flex gap-2">
        {!account && (
          <button className="btn-black flex-1 !rounded-xl !py-2 text-[12.5px]" onClick={() => openAuth(true)}>
            + Add Google / email
          </button>
        )}
        <LogOutButton compact />
      </div>
    </div>
  )
}

/** People you've added (tap → their profile card). */
function Friends() {
  const links = useStore((s) => s.friendLinks)
  const list = Object.entries(links).sort((a, b) => b[1].since - a[1].since)
  return (
    <>
      <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">
        Friends <span className="num text-white/60">{list.filter(([, l]) => l.status === 'friends').length}</span>
      </h3>
      {list.length ? (
        <div className="flex flex-wrap gap-1.5">
          {list.map(([h, l]) => (
            <Person key={h} handle={h} avatar={l.avatar} className="flex items-center gap-1.5 !rounded-full border hairline py-1 pr-2.5 pl-1 text-[12px] text-white/85">
              <Avatar id={l.avatar} handle={h} size={20} ring={l.status === 'friends' ? '#14f195' : undefined} />
              {h}
              {l.status === 'pending' && <span className="text-[10px] text-fog">· requested</span>}
            </Person>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-fog">Tap anyone's avatar on the map or in a hex to see their profile and add them.</p>
      )}
    </>
  )
}

const DoorIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 16l4-4-4-4M14 12H4" />
  </svg>
)

/** Glass log-out card: red icon tile, who you are, two-tap confirm (no accidental log-outs). */
export function LogOutButton({ compact = false }: { compact?: boolean }) {
  const account = useStore((s) => s.account)
  const wallet = useStore((s) => s.wallet)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  const who = account?.email ?? account?.handle ?? (wallet ? `wallet ${short(wallet.address)}` : '')
  const go = () => (armed ? logOutAll() : setArmed(true))
  if (compact)
    return (
      <button
        onClick={go}
        className={`group flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-[12.5px] font-medium transition-[border-color,background-color,color] duration-300 ${armed ? 'border-[#ff5a5a]/70 bg-[#ff5a5a]/25 text-white' : 'border-white/12 bg-white/[.04] text-[#ff8a8a] hover:border-[#ff5a5a]/45 hover:bg-[#ff5a5a]/10'}`}
      >
        <DoorIcon className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-0.5" />
        {armed ? 'Tap to confirm' : 'Log out'}
      </button>
    )
  return (
    <button
      onClick={go}
      className={`group mt-6 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-300 ${armed ? 'border-[#ff5a5a]/70 bg-[#ff5a5a]/[.16] shadow-[0_0_32px_rgba(255,90,90,.25)]' : 'border-white/10 bg-white/[.03] hover:border-[#ff5a5a]/40 hover:bg-[#ff5a5a]/[.06]'}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors duration-300 ${armed ? 'bg-[#ff5a5a] text-white' : 'bg-[#ff5a5a]/15 text-[#ff8a8a]'}`}>
        <DoorIcon className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-white">{armed ? 'Tap again to log out' : 'Log out'}</span>
        <span className="block truncate text-[11.5px] text-fog">{armed ? 'You can log back in any time' : who ? `Signed in as ${who}` : 'End this session'}</span>
      </span>
      <span className={`text-[16px] transition-all duration-300 ${armed ? 'text-[#ff8a8a]' : 'text-white/30 group-hover:translate-x-0.5 group-hover:text-[#ff8a8a]'}`}>›</span>
    </button>
  )
}

function LogOutFooter() {
  const loggedIn = useStore((s) => !!s.account || !!s.wallet)
  const openAuth = useStore((s) => s.setAuthOpen)
  return loggedIn ? (
    <LogOutButton />
  ) : (
    <button onClick={() => openAuth(true)} className="btn-ember mt-6 w-full text-[13.5px]">
      Log in / Sign up
    </button>
  )
}
