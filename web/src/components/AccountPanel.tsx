import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { AVATARS } from '../lib/avatars'
import { short } from '../lib/format'
import type { Vibe } from '../lib/types'
import { Avatar, Panel } from './bits'
import { H3_AREA_LABEL } from '../lib/h3'
import TimelineImport from './TimelineImport'
import { logout, updateProfile, AUTH_DEMO } from '../lib/auth'
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
  // signed in: the avatar is saved to the account, so other people see it too
  const pickAvatar = async (avatar: string) => {
    setMe({ avatar })
    const account = s().account
    if (AUTH_DEMO || !account) return
    const r = await updateProfile({ avatar })
    if (r.ok) s().setAccount({ ...account, avatar })
    else s().toast('Could not save the avatar. Try again.', 'ember')
  }

  return (
    <Panel kicker="Account" title={me.handle} onClose={() => s().setTab('explore')}>
      <div className="flex items-center gap-4">
        <Avatar id={me.avatar} handle={me.handle} size={64} ring="#ff5a1f" />
        <HandleField />
      </div>

      <SignedIn />
      <Friends />

      <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Avatar</h3>
      <div className="grid grid-cols-8 gap-2">
        {AVATARS.map((a) => (
          <button key={a} onClick={() => pickAvatar(a)} aria-label={`Avatar ${a}`} className={`rounded-full transition ${me.avatar === a ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}>
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

const HANDLE_OK = /^[a-z0-9._]{2,20}$/

/** Username: type, then Save. Signed in → saved to the account (and checked for being free). */
function HandleField() {
  const me = useStore((s) => s.me)
  const account = useStore((s) => s.account)
  const [draft, setDraft] = useState(me.handle.replace(/^@/, ''))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => setDraft(me.handle.replace(/^@/, '')), [me.handle])
  const next = '@' + draft
  const changed = next !== me.handle
  const valid = HANDLE_OK.test(draft)
  const save = async () => {
    if (!changed || !valid || busy) return
    setMsg(null)
    const st = useStore.getState()
    if (!AUTH_DEMO && account) {
      setBusy(true)
      const r = await updateProfile({ handle: next })
      setBusy(false)
      if (!r.ok) return setMsg({ ok: false, text: r.error === 'handle_taken' ? 'That username is taken. Try another.' : r.error === 'invalid' ? 'Use 2–20 letters, numbers, dots or underscores.' : r.error === 'unauthenticated' ? 'Your session ended. Sign in again.' : 'Could not save. Check your connection.' })
      const old = me.handle
      st.setAccount({ ...account, handle: next })
      // your posts already on screen follow the new name
      useStore.setState({ comments: st.comments.map((c) => (c.accountId === account.id || c.handle === old ? { ...c, handle: next } : c)) })
    } else st.setMe({ handle: next })
    setMsg({ ok: true, text: 'Saved ✓' })
  }
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="text-[11px] tracking-[0.16em] text-fog uppercase" htmlFor="handle">
        Username
      </label>
      <div className="mt-1 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/40">@</span>
          <input
            id="handle"
            className="input !pl-7"
            value={draft}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value.replace(/^@/, '').replace(/[^a-z0-9._]/gi, '').toLowerCase())
              setMsg(null)
            }}
          />
        </div>
        <button className="shrink-0 rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] px-3.5 text-[13px] font-semibold text-black disabled:opacity-35" disabled={!changed || !valid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg ? (
        <p className={`mt-1 text-[11.5px] ${msg.ok ? 'text-[#14f195]' : 'text-[#ff8a8a]'}`} role="status">
          {msg.text}
        </p>
      ) : changed && !valid ? (
        <p className="mt-1 text-[11.5px] text-fog">2–20 letters, numbers, dots or underscores.</p>
      ) : null}
    </form>
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

/** Friend requests waiting for you, then the people you've added (tap → their profile card). */
function Friends() {
  const links = useStore((s) => s.friendLinks)
  const all = Object.entries(links).sort((a, b) => b[1].since - a[1].since)
  const incoming = all.filter(([, l]) => l.status === 'incoming')
  const list = all.filter(([, l]) => l.status !== 'incoming')
  const s = useStore.getState()
  useEffect(() => {
    useStore.getState().loadFriends()
  }, [])
  return (
    <>
      {incoming.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-[#14f195] uppercase">
            Friend requests <span className="num">{incoming.length}</span>
          </h3>
          <ul className="space-y-1.5" aria-label="Friend requests">
            {incoming.map(([h, l]) => (
              <li key={h} className="flex items-center gap-2 rounded-2xl border border-[#14f195]/25 bg-[#14f195]/[.05] p-2">
                <Person handle={h} avatar={l.avatar} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-white">
                  <Avatar id={l.avatar} handle={h} size={26} />
                  <span className="truncate">{h}</span>
                </Person>
                <button onClick={() => s.addFriend(h, l.avatar)} className="rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] px-3 py-1.5 text-[12px] font-semibold text-black">
                  Accept
                </button>
                <button onClick={() => s.removeFriend(h)} className="btn-black !rounded-xl !px-2.5 !py-1.5 text-[11.5px] text-white/70" aria-label={`Decline ${h}`}>
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
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
