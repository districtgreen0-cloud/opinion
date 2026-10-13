import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore, type Tab } from '../store'
import { Icon, reduced } from './bits'

const TABS: { id: Tab; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'events', label: 'Events' },
  { id: 'crews', label: 'Crews' },
  { id: 'market', label: 'Market' },
  { id: 'chat', label: 'ZK Chat' },
  { id: 'rewards', label: 'Rewards' },
]

export default function Dock() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const lens = useRef<HTMLSpanElement>(null)
  const items = useRef<Record<string, HTMLButtonElement | null>>({})
  const first = useRef(true)

  // glass lens glides to the active tab and stretches mid-flight
  useLayoutEffect(() => {
    const el = items.current[tab]
    const l = lens.current
    if (!l) return
    if (!el) {
      gsap.to(l, { opacity: 0, duration: 0.25 })
      return
    }
    const x = el.offsetLeft
    const w = el.offsetWidth
    if (first.current || reduced()) {
      gsap.set(l, { x, width: w, opacity: 1 })
      first.current = false
      return
    }
    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .to(l, { opacity: 1, scaleY: 0.86, duration: 0.18, ease: 'power2.out' })
      .to(l, { x, width: w, duration: 0.55, ease: 'expo.out' }, 0)
      .to(l, { scaleY: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, 0.18)
    const icon = el.querySelector('svg')
    if (icon) gsap.fromTo(icon, { y: 4, rotate: -12, scale: 0.8 }, { y: 0, rotate: 0, scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' })
  }, [tab])

  return (
    <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-1.5 pb-[max(6px,calc(env(safe-area-inset-bottom)-16px))] sm:px-2 sm:pb-[max(10px,env(safe-area-inset-bottom))]">
      <div className="glass-strong pointer-events-auto relative flex h-[54px] w-full max-w-[460px] items-stretch justify-between rounded-[20px] p-1 sm:h-[60px] sm:rounded-[22px] sm:p-1.5">
        <span
          ref={lens}
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-2xl border border-white/15 opacity-0 sm:top-1.5 sm:bottom-1.5"
          style={{
            background: 'var(--lens)',
            boxShadow: 'var(--lens-shadow)',
            backdropFilter: 'blur(12px)',
          }}
        />
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button
              key={t.id}
              ref={(b) => {
                items.current[t.id] = b
              }}
              onClick={() => setTab(on && t.id !== 'explore' ? 'explore' : t.id)}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] overflow-hidden rounded-2xl text-[9px] leading-none font-medium whitespace-nowrap transition-colors sm:gap-0.5 sm:text-[10px] sm:tracking-wide ${on ? 'text-white' : 'text-fog hover:text-white'}`}
              aria-current={on ? 'page' : undefined}
            >
              <Icon name={t.id} className="h-[17px] w-[17px] shrink-0 sm:h-[19px] sm:w-[19px]" />
              <span className="max-w-full truncate px-0.5">{t.label}</span>
              {on && <span className="absolute top-1 h-[3px] w-[3px] rounded-full bg-ember shadow-[0_0_8px_#ff5a1f]" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
