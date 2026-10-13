import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore, type HomeFilter } from '../store'
import { cityData } from '../data/mock'
import { kindOf } from '../lib/types'
import { reduced } from './bits'
import { useCityGames } from './SportsList'

type F = HomeFilter
const ITEMS: { id: F; label: string; dot: string }[] = [
  { id: 'all', label: 'All', dot: '#ffffff' },
  { id: 'event', label: 'Events', dot: '#00c2ff' },
  { id: 'sport', label: 'Sports', dot: '#ffb020' },
  { id: 'topic', label: 'Topics', dot: '#b26bff' },
  { id: 'note', label: 'Notes', dot: '#e8e8ee' },
  { id: 'job', label: 'Jobs', dot: '#3dffa8' },
]

/** Home-screen switch: what the map and feed show across the whole city. */
export default function HomeTabs() {
  const filter = useStore((s) => s.homeFilter)
  const set = useStore((s) => s.setHomeFilter)
  const cell = useStore((s) => s.selectedCell)
  const comments = useStore((s) => s.comments)
  const city = useStore((s) => s.city)
  const games = useCityGames()
  const lens = useRef<HTMLSpanElement>(null)
  const btns = useRef<Record<string, HTMLButtonElement | null>>({})
  const first = useRef(true)
  const bar = useRef<HTMLDivElement>(null)
  // phones: the row is wider than the screen → swipe it; fade whichever edge has more tabs behind it
  const [fade, setFade] = useState<string | undefined>()
  const edge = useCallback(() => {
    const el = bar.current
    if (!el || el.scrollWidth <= el.clientWidth + 1) return setFade(undefined)
    const l = el.scrollLeft > 4
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setFade(`linear-gradient(90deg, ${l ? 'transparent, #000 28px' : '#000'}, ${r ? '#000 calc(100% - 28px), transparent' : '#000'})`)
  }, [])
  useEffect(() => {
    edge()
    addEventListener('resize', edge)
    return () => removeEventListener('resize', edge)
  }, [edge])

  const counts = useMemo(() => {
    const c = { all: 0, event: cityData(city).events.length, sport: games.length, topic: 0, note: 0, job: 0 }
    for (const p of comments) {
      const k = kindOf(p)
      if (k === 'reply') continue
      if (k === 'job' && !['open', 'funded'].includes(p.jobStatus ?? 'open')) continue // only jobs you can still take
      c[k]++
      c.all++
    }
    return c
  }, [comments, city, games])

  useLayoutEffect(() => {
    btns.current[filter]?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' })
  }, [filter])

  useLayoutEffect(() => {
    const el = btns.current[filter]
    if (!el || !lens.current) return
    const to = { x: el.offsetLeft, width: el.offsetWidth }
    if (first.current || reduced()) {
      gsap.set(lens.current, { ...to, opacity: 1 })
      first.current = false
    } else gsap.to(lens.current, { ...to, duration: 0.5, ease: 'expo.out', overwrite: 'auto' })
  }, [filter])

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-[62px] z-20 justify-center px-2 md:top-[76px] ${cell ? 'flex md:hidden xl:flex' : 'flex'}`}
    >
      <div ref={bar}
        onScroll={edge}
        className="glass-strong no-scrollbar pointer-events-auto relative flex max-w-full overflow-x-auto rounded-2xl p-[5px] sm:p-1"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
        role="tablist"
        aria-label="Show on map"
      >
        <span
          ref={lens}
          aria-hidden
          className="absolute top-[5px] bottom-[5px] left-0 rounded-xl sm:top-1 sm:bottom-1 border border-white/15 opacity-0"
          style={{ background: 'var(--lens)', boxShadow: 'var(--lens-shadow)' }}
        />
        {ITEMS.map((it) => (
          <button
            key={it.id}
            ref={(b) => {
              btns.current[it.id] = b
            }}
            role="tab"
            aria-selected={filter === it.id}
            onClick={() => set(it.id)}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-[5px] py-[5px] text-[11.25px] font-medium uppercase sm:tracking-wide transition-colors sm:px-3.5 sm:text-[12px] ${filter === it.id ? 'text-white' : 'text-fog hover:text-white'}`}
          >
            {it.id !== 'all' && <span className="hidden h-1.5 w-1.5 rounded-full sm:inline-block" style={{ background: it.dot, boxShadow: `0 0 8px ${it.dot}` }} />}
            {it.label}
            <span className="num hidden text-[10.5px] text-white/40 sm:inline">{counts[it.id]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
