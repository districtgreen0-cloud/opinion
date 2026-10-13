import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { cityData } from '../data/mock'
import { cellCenter } from '../lib/h3'
import { ago } from '../lib/format'
import { avatarColor } from '../lib/avatars'
import { kindOf } from '../lib/types'
import { Avatar, reduced } from './bits'

/** Wrap any avatar / handle: tap → small profile card (anchored where you tapped). */
export function Person({ handle, avatar, children, className = '' }: { handle: string; avatar: string; children: ReactNode; className?: string }) {
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    useStore.getState().openProfile({ handle, avatar, x: r.left + r.width / 2, y: r.bottom })
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`View ${handle}'s profile`}
      onClick={open}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(e)}
      className={`cursor-pointer rounded-full transition-[filter,opacity] hover:brightness-125 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40 ${className}`}
    >
      {children}
    </span>
  )
}

const VIBE: Record<string, { label: string; c: string }> = {
  out: { label: 'out tonight', c: '#ff5a1f' },
  chill: { label: 'chilling', c: '#8c8ca0' },
  looking: { label: 'looking for plans', c: '#3dffa8' },
}

/** The small glass profile card: who they are, what they post here, add friend. */
export default function ProfileCard() {
  const p = useStore((s) => s.profile)
  const close = () => useStore.getState().openProfile(null)
  const comments = useStore((s) => s.comments)
  const city = useStore((s) => s.city)
  const me = useStore((s) => s.me.handle)
  const link = useStore((s) => (p ? s.friendLinks[p.handle] : undefined))
  const ref = useRef<HTMLDivElement>(null)

  const info = useMemo(() => {
    if (!p) return null
    const posts = comments.filter((c) => c.handle === p.handle)
    const onMap = cityData(city).friends.find((f) => f.handle === p.handle)
    return {
      posts,
      hexes: new Set(posts.map((c) => c.cell)).size,
      topics: posts.filter((c) => kindOf(c) === 'topic').length,
      jobs: posts.filter((c) => kindOf(c) === 'job').length,
      last: posts[0]?.createdAt,
      onMap,
      recent: posts.filter((c) => kindOf(c) !== 'reply').slice(0, 2),
    }
  }, [p, comments, city])

  // place next to the tap, clamped inside the screen; pop in
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !p) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const x = Math.min(Math.max(12, (p.x ?? innerWidth / 2) - w / 2), innerWidth - w - 12)
    let y = (p.y ?? innerHeight / 2) + 10
    if (y + h > innerHeight - 90) y = Math.max(12, (p.y ?? innerHeight / 2) - h - 40)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    if (!reduced()) gsap.fromTo(el, { opacity: 0, y: -8, scale: 0.94, filter: 'blur(6px)' }, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.35, ease: 'expo.out' })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [p])

  if (!p || !info) return null
  const self = p.handle === me
  const vibe = info.onMap ? VIBE[info.onMap.vibe] : undefined
  const ring = avatarColor(p.avatar)
  const s = useStore.getState()
  return (
    <div className="fixed inset-0 z-[45]" onClick={close} role="presentation">
      <div
        ref={ref}
        role="dialog"
        aria-label={`${p.handle} profile`}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong fixed w-[248px] rounded-[20px] p-3 shadow-[0_20px_60px_rgba(0,0,0,.6)]"
        style={{ left: -999, top: -999, background: 'var(--panel-solid)' }}
      >
        <div className="flex items-center gap-2.5">
          <Avatar id={p.avatar} handle={p.handle} size={42} ring={link?.status === 'friends' ? '#14f195' : ring} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold text-white">{p.handle}</span>
              {link?.status === 'friends' && <span className="rounded bg-[#14f195]/15 px-1 font-mono text-[8.5px] tracking-[0.12em] text-[#14f195]">FRIEND</span>}
            </div>
            <div className="flex items-center gap-1.5 truncate text-[10.5px] text-fog">
              {info.onMap?.online ? <span className="live-dot" /> : null}
              {vibe ? <span style={{ color: vibe.c }}>{vibe.label}</span> : info.last ? <>active {ago(info.last)}</> : <>new here</>}
              <span>· {city.name}</span>
            </div>
          </div>
          <button onClick={close} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close profile">
            ✕
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-xl bg-white/[.03] py-1.5 text-center ring-1 ring-white/5">
          {[
            [info.posts.length, 'posts'],
            [info.hexes, 'hexes'],
            [info.topics, 'topics'],
            [info.jobs, 'jobs'],
          ].map(([n, l]) => (
            <div key={l}>
              <div className="num text-[13px] font-semibold text-white">{n}</div>
              <div className="font-mono text-[8.5px] tracking-[0.1em] text-fog uppercase">{l}</div>
            </div>
          ))}
        </div>

        {info.recent.length > 0 && (
          <ul className="mt-2 space-y-1">
            {info.recent.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    const [lng, lat] = cellCenter(c.cell)
                    s.flyTo(lng, lat, 16.8)
                    s.selectCell(c.cell)
                    s.setTab('explore')
                    close()
                  }}
                  className="w-full truncate rounded-lg px-2 py-1 text-left text-[11.5px] text-white/75 hover:bg-white/[.05]"
                >
                  <span className="text-fog">{ago(c.createdAt)} · </span>
                  {c.title ?? c.text}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2.5 flex gap-1.5">
          {self ? (
            <div className="flex-1 rounded-xl py-1.5 text-center text-[11.5px] text-fog ring-1 ring-white/10">That's you ✦</div>
          ) : link?.status === 'friends' ? (
            <>
              <button
                onClick={() => {
                  s.setTab('chat')
                  close()
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] py-1.5 text-[12px] font-semibold text-black transition-[filter] hover:brightness-110"
              >
                Message
              </button>
              <button onClick={() => s.removeFriend(p.handle)} className="btn-black !rounded-xl !px-2.5 !py-1.5 text-[11px]" aria-label={`Remove ${p.handle} from friends`}>
                ✓ Friends
              </button>
            </>
          ) : link?.status === 'pending' ? (
            <button onClick={() => s.removeFriend(p.handle)} className="btn-black flex-1 !rounded-xl !py-1.5 text-[12px] text-white/70">
              Requested · cancel
            </button>
          ) : (
            <button
              onClick={() => s.addFriend(p.handle, p.avatar)}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#9945ff] to-[#14f195] py-1.5 text-[12px] font-semibold text-black transition-[filter] hover:brightness-110"
            >
              + Add friend
            </button>
          )}
          {info.onMap && (
            <button
              onClick={() => {
                s.flyTo(info.onMap!.lng, info.onMap!.lat, 17)
                s.setTab('explore')
                close()
              }}
              className="btn-black !rounded-xl !px-2.5 !py-1.5 text-[11px]"
              aria-label={`Find ${p.handle} on the map`}
            >
              📍
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
