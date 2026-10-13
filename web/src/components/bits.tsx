import { useEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { avatarSrc } from '../lib/avatars'

gsap.registerPlugin(useGSAP)

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Avatar({ id, handle, size = 28, ring }: { id: string; handle?: string; size?: number; ring?: string }) {
  return (
    <img
      src={avatarSrc(id, handle)}
      width={size}
      height={size}
      alt={handle ?? ''}
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 1.5px #000, 0 0 0 3px ${ring}` : undefined }}
    />
  )
}

/** Tween a number toward its new value — big-number energy. */
export function Ticker({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const state = useRef({ v: value })
  useEffect(() => {
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    if (reduced()) {
      state.current.v = value
      if (ref.current) ref.current.textContent = fmt(value)
      return
    }
    const t = gsap.to(state.current, {
      v: value,
      duration: 1.1,
      ease: 'expo.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = fmt(state.current.v)
      },
    })
    return () => {
      t.kill()
    }
  }, [value, decimals])
  return <span ref={ref} className={`num ${className ?? ''}`} />
}

/** Glass panel that rises out of the dark. Left rail on desktop, bottom sheet on mobile. */
export function Panel({ title, kicker, children, onClose, right }: { title: string; kicker?: string; children: ReactNode; onClose?: () => void; right?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (reduced()) return
      gsap.from(ref.current, { y: 24, opacity: 0, filter: 'blur(8px)', duration: 0.6, ease: 'expo.out' })
      gsap.from('[data-stagger] > *', { y: 14, opacity: 0, duration: 0.5, ease: 'expo.out', stagger: 0.04, delay: 0.08 })
    },
    { scope: ref },
  )
  return (
    <section
      ref={ref}
      className="glass-strong pointer-events-auto absolute inset-x-2 bottom-[calc(var(--dock-h)+10px)] z-20 flex max-h-[62vh] flex-col overflow-hidden rounded-[22px] md:inset-x-auto md:bottom-[calc(var(--dock-h)+14px)] md:left-4 md:top-[84px] md:max-h-none md:w-[400px]"
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          {kicker && <div className="mb-1 text-[10px] font-medium tracking-[0.25em] text-fog uppercase">{kicker}</div>}
          <h2 className="font-display text-[22px] font-semibold leading-none tracking-tight text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {right}
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="glass-btn grid h-8 w-8 place-items-center !rounded-full !p-0 text-fog hover:text-white">
              ✕
            </button>
          )}
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5" data-stagger>
        {children}
      </div>
    </section>
  )
}

export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const p: Record<string, ReactNode> = {
    explore: <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />,
    events: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    crews: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4" />
        <circle cx="17" cy="7" r="2.4" />
        <path d="M16 13.2c2.6.2 4.4 2 5 4.8" />
      </>
    ),
    market: (
      <>
        <path d="M4 8h16l-1.4 10.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
    chat: (
      <>
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
      </>
    ),
    rewards: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
      </>
    ),
    teleport: <path d="M12 2v6m0 8v6M4.9 4.9l4.2 4.2m5.8 5.8 4.2 4.2M2 12h6m8 0h6M4.9 19.1l4.2-4.2m5.8-5.8 4.2-4.2" />,
    compass: <path d="M12 2 15 12 12 22 9 12z" />,
    light: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    feed: <path d="M4 6h16M4 12h10M4 18h13" />,
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  )
}

/** "LUMA" / "EVENTBRITE" pill for events pulled from live feeds. */
export function SourceBadge({ source }: { source?: string }) {
  if (source !== 'luma' && source !== 'eventbrite') return null
  return (
    <span className={`ml-1.5 inline-block rounded px-1.5 py-px align-middle font-mono text-[9px] font-bold tracking-[0.12em] ${source === 'luma' ? 'bg-white text-black' : 'bg-[#f05537] text-white'}`}>
      {source === 'luma' ? 'LUMA' : 'EVENTBRITE'}
    </span>
  )
}
