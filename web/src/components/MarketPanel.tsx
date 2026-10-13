import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { cityData } from '../data/mock'
import { cellCenter, shortCell, toCell } from '../lib/h3'
import { km, fmtKm, nf } from '../lib/format'
import { kindOf } from '../lib/types'
import { Avatar, Panel } from './bits'
import JobCard from './JobCard'
import CardsTab from './CardsTab'
import { Person } from './Profile'

const STEPS = ['open', 'escrow', 'sold'] as const

function Tickets() {
  const city = useStore((s) => s.city)
  const listings = useStore((s) => s.listings)
  const wallet = useStore((s) => s.wallet)
  const s = useStore.getState
  const events = useMemo(() => cityData(city).events, [city])

  const buy = (id: string) => {
    if (!wallet) {
      s().toast('Connect a wallet to buy', 'ember')
      return
    }
    s().updateListing(id, 'escrow')
    s().toast('USDC locked in escrow · released at the door', 'violet')
    setTimeout(() => {
      s().updateListing(id, 'sold')
      s().toast('Ticket scanned · seller paid ✓', 'mint')
    }, 6000)
  }

  return (
    <>
      <div className="mb-4 rounded-2xl border hairline p-3 text-[12px] leading-relaxed text-fog">
        Resell tickets safely. Funds sit in an on-chain escrow and release to the seller only when the ticket is scanned at the door.
      </div>
      <div className="space-y-3">
        {listings.map((l) => {
          const ev = events.find((e) => e.id === l.eventId)!
          const step = STEPS.indexOf(l.status)
          return (
            <div key={l.id} className="rounded-[18px] border hairline bg-white/[.02] p-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 rounded-xl" style={{ background: ev.cover }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-white">{ev.title}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-fog">
                    <Person handle={l.seller} avatar={l.avatar} className="flex items-center gap-1.5"><Avatar id={l.avatar} handle={l.seller} size={14} /> {l.seller}</Person> · {l.tier}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-[18px] font-semibold text-white">${l.priceUsdc}</div>
                  <div className="text-[10px] text-fog">USDC</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {STEPS.map((st, i) => (
                  <div key={st} className="flex flex-1 flex-col gap-1">
                    <div className={`h-1 rounded-full ${i <= step ? (i === 2 ? 'bg-mint' : i === 1 ? 'bg-violet' : 'bg-white/40') : 'bg-white/10'}`} />
                    <span className={`text-[9px] tracking-[0.15em] uppercase ${i <= step ? 'text-white/70' : 'text-white/25'}`}>{st}</span>
                  </div>
                ))}
              </div>
              {l.status === 'open' && (
                <button className="btn-ember mt-3 w-full text-[13px]" onClick={() => buy(l.id)}>
                  Buy with escrow
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function MarketPanel() {
  const tab = useStore((s) => s.marketTab)
  const s = useStore.getState
  return (
    <Panel kicker="Peer-to-peer · USDC escrow" title="Market" onClose={() => s().setTab('explore')}>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border hairline bg-white/[.02] p-1" role="tablist">
        {(['jobs', 'tickets', 'cards'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => s().setMarketTab(t)}
            className={`rounded-xl py-2 text-[12.5px] font-medium capitalize transition ${tab === t ? 'bg-gradient-to-b from-white/[.14] to-white/[.03] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]' : 'text-fog hover:text-white'}`}
          >
            {t === 'jobs' ? 'Jobs · USDC' : t === 'tickets' ? 'Tickets' : '💳 Cards'}
          </button>
        ))}
      </div>
      {tab === 'jobs' ? <Jobs /> : tab === 'tickets' ? <Tickets /> : <CardsTab />}
    </Panel>
  )
}

type JobFilter = 'available' | 'mine' | 'all'

/** Every job offer in the city, from every hex. */
function Jobs() {
  const comments = useStore((s) => s.comments)
  const wallet = useStore((s) => s.wallet)
  const me = useStore((s) => s.me)
  const pos = useStore((s) => s.pos)
  const city = useStore((s) => s.city)
  const s = useStore.getState
  const [filter, setFilter] = useState<JobFilter>('available')
  const [sort, setSort] = useState<'new' | 'pay' | 'near'>('new')

  const jobs = useMemo(() => comments.filter((c) => kindOf(c) === 'job'), [comments])
  const [olng, olat] = pos ? [pos.lng, pos.lat] : city.center
  const distOf = (cell: string) => {
    const [lng, lat] = cellCenter(cell)
    return km(olat, olng, lat, lng)
  }
  const isMine = (j: (typeof jobs)[number]) => (!!wallet && (j.wallet === wallet.address || j.workerWallet === wallet.address)) || j.workerHandle === me.handle
  const list = jobs
    .filter((j) => (filter === 'all' ? true : filter === 'mine' ? isMine(j) : ['open', 'funded'].includes(j.jobStatus ?? 'open')))
    .sort((a, b) => (sort === 'pay' ? (b.priceUsdc ?? 0) - (a.priceUsdc ?? 0) : sort === 'near' ? distOf(a.cell) - distOf(b.cell) : b.createdAt - a.createdAt))
  const openUsdc = jobs.filter((j) => j.jobStatus === 'funded').reduce((a, j) => a + (j.priceUsdc ?? 0), 0)
  const events = cityData(city).events

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        {[
          [nf(jobs.filter((j) => ['open', 'funded'].includes(j.jobStatus ?? 'open')).length), 'open jobs'],
          [nf(openUsdc), 'USDC in escrow'],
          [nf(jobs.filter((j) => j.jobStatus === 'paid').length), 'paid out'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-white/[.03] px-2 py-2">
            <div className="num text-[16px] font-semibold text-white">{v}</div>
            <div className="text-[9px] tracking-[0.14em] text-fog uppercase">{l}</div>
          </div>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {(
          [
            ['available', 'Available'],
            ['mine', 'Mine'],
            ['all', 'All'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className="chip" data-on={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] tracking-[0.16em] text-fog uppercase">Sort</span>
        {(
          [
            ['new', 'Newest'],
            ['pay', 'Top pay'],
            ['near', 'Nearest'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className="chip" data-on={sort === k} onClick={() => setSort(k)}>
            {l}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-white/35">Post a job from any hex: Explore → tap a hex → Jobs. The poster funds escrow, a worker takes it, and USDC is released on delivery.</p>
      <div className="space-y-2">
        {list.length === 0 && <div className="py-8 text-center text-[13px] text-fog">{filter === 'mine' ? 'You have no jobs yet.' : 'No open jobs right now.'}</div>}
        {list.map((j) => {
          const ev = events.find((e) => toCell(e.lat, e.lng) === j.cell)
          return (
            <div key={j.id}>
              <div className="mb-1 flex items-center justify-between px-1 text-[10.5px] text-fog">
                <span>
                  ⬡ {ev ? ev.venue : `hex ${shortCell(j.cell)}`} · {fmtKm(distOf(j.cell))}
                </span>
                <button
                  className="text-white/60 hover:text-white"
                  onClick={() => {
                    const [lng, lat] = cellCenter(j.cell)
                    s().setHexTab('job')
                    s().selectCell(j.cell)
                    s().setTab('explore')
                    s().flyTo(lng, lat, 16.6)
                  }}
                >
                  Show on map →
                </button>
              </div>
              <JobCard job={j} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
