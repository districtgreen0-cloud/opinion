import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { brandName, CARDS, CITY_COUNTRY, COUNTRIES, type CountryCode, type CryptoCard } from '../lib/cards'
import CardArt from './CardArt'

type Filter = 'solana' | 'self' | 'lowkyc' | 'cashback' | 'physical'
const FILTERS: { id: Filter; label: string; test: (c: CryptoCard) => boolean }[] = [
  { id: 'solana', label: '◎ Solana', test: (c) => c.solana },
  { id: 'self', label: 'Self-custody', test: (c) => c.custody === 'self' },
  { id: 'lowkyc', label: 'Light / no KYC', test: (c) => c.kyc === 'light' || c.kyc === 'none' },
  { id: 'cashback', label: 'Cashback', test: (c) => !!c.cashback },
  { id: 'physical', label: 'Physical card', test: (c) => c.physical },
]
const PILL: Record<string, string> = {
  available: 'bg-[#14f195] text-black',
  waitlist: 'bg-[#ffd23d] text-black',
  unknown: 'border border-[#00c2ff]/40 bg-[#00c2ff]/10 text-[#7fdcff]',
  not_available: 'bg-white/5 text-white/40',
}
const PILL_TEXT: Record<string, string> = { available: 'Available', waitlist: 'Waitlist', unknown: 'Check eligibility', not_available: 'Not here' }

/** Crypto / neobank cards you can get in the current city's country. */
export default function CardsTab() {
  const city = useStore((s) => s.city)
  const [country, setCountry] = useState<CountryCode>(CITY_COUNTRY[city.id].code)
  const [on, setOn] = useState<Filter[]>([])
  const [showOthers, setShowOthers] = useState(false)
  const meta = COUNTRIES.find((c) => c.code === country)!

  const { avail, others } = useMemo(() => {
    const pass = (c: CryptoCard) => on.every((f) => FILTERS.find((x) => x.id === f)!.test(c))
    const list = CARDS.filter(pass)
    const rank = { available: 0, waitlist: 1, unknown: 2, not_available: 3 } as Record<string, number>
    return {
      // confirmed first, then waitlist, then 'check eligibility' (issuer doesn't say either way)
      avail: list.filter((c) => c.countries[country] !== 'not_available').sort((a, b) => rank[a.countries[country]] - rank[b.countries[country]] || Number(b.solana) - Number(a.solana)),
      others: list.filter((c) => c.countries[country] === 'not_available'),
    }
  }, [country, on])

  if (!CARDS.length) return <p className="py-8 text-center text-[13px] text-fog">Card data is being prepared…</p>

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[10.5px] tracking-[0.16em] text-fog uppercase">Cards in</div>
          <div className="font-display text-[19px] leading-tight font-semibold text-white">
            {meta.flag} {meta.name} · <span className="text-[#14f195]">{avail.filter((c) => c.countries[country] === 'available').length}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {COUNTRIES.map((c) => (
            <button key={c.code} className="chip !px-2.5" data-on={country === c.code} onClick={() => setCountry(c.code)} aria-label={c.name}>
              {c.flag} {c.short}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} className="chip" data-on={on.includes(f.id)} onClick={() => setOn((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id]))}>
            {f.label}
          </button>
        ))}
      </div>

      {avail.some((c) => c.countries[country] === 'unknown') && (
        <p className="mb-2 text-[10.5px] leading-relaxed text-white/40">
          <span className="text-[#7fdcff]">Check eligibility</span> = the issuer doesn't say whether {meta.name} is supported. Confirm in their app before KYC.
        </p>
      )}
      <ul className="space-y-2.5">
        {avail.length === 0 && <li className="py-6 text-center text-[13px] text-fog">No cards match these filters here.</li>}
        {avail.map((c) => (
          <CardRow key={c.id} c={c} status={c.countries[country]} />
        ))}
      </ul>

      {others.length > 0 && (
        <div className="mt-5">
          <button className="text-[12px] text-fog hover:text-white" onClick={() => setShowOthers((s) => !s)}>
            {showOthers ? '▾' : '▸'} {others.length} not available in {meta.name}
          </button>
          {showOthers && (
            <ul className="mt-2 space-y-2.5 opacity-70">
              {others.map((c) => (
                <CardRow key={c.id} c={c} status={c.countries[country]} />
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-5 text-[10.5px] leading-relaxed text-white/30">
        Compiled from each issuer's own website (checked {CARDS[0]?.checkedAt}). Availability, fees and KYC change often: confirm with the issuer before applying. Not financial advice. Card images are illustrations, not official artwork.
      </p>
    </div>
  )
}

function CardRow({ c, status }: { c: CryptoCard; status: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-[18px] border hairline bg-white/[.02] p-3">
      <div className="flex gap-3">
        <CardArt card={c} width={116} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-medium text-white">{c.name}</div>
              <div className="truncate text-[11px] text-white/45">
                {c.issuer !== c.name && brandName(c) !== c.issuer ? `${c.issuer} · ` : ''}
                {c.network} · {c.type} · {c.custody === 'self' ? 'self-custody' : 'custodial'}
              </div>
            </div>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wider uppercase ${PILL[status] ?? PILL.unknown}`}>{PILL_TEXT[status] ?? status}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.solana && <Tag>◎ Solana</Tag>}
            <Tag>KYC: {c.kyc}</Tag>
            {c.cashback && <Tag>{c.cashback.length > 26 ? c.cashback.slice(0, 25) + '…' : c.cashback}</Tag>}
            {c.physical && <Tag>Physical</Tag>}
            {c.virtual && <Tag>Virtual</Tag>}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button className="shrink-0 text-[11.5px] whitespace-nowrap text-fog hover:text-white" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Less' : 'Fees & details'}
        </button>
        <a href={c.url} target="_blank" rel="noreferrer noopener" className="btn-ghost truncate !px-3 !py-1.5 text-[12px]">
          Apply on {brandName(c)} ↗
        </a>
      </div>
      {open && (
        <div className="mt-2 space-y-1 border-t hairline pt-2 text-[11.5px] leading-relaxed text-white/65">
          <div>
            <b className="text-white/80">Fees:</b> {c.fees || '—'}
          </div>
          {c.chains?.length > 0 && (
            <div>
              <b className="text-white/80">Chains:</b> {c.chains.join(', ')}
            </div>
          )}
          {c.notes && <div className="text-white/50">{c.notes}</div>}
          <div className="truncate text-white/35">Source: {c.sources?.[0]?.replace(/^https?:\/\//, '')}</div>
        </div>
      )}
    </li>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-white/[.05] px-1.5 py-0.5 text-[10px] text-white/70">{children}</span>
}
