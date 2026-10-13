import { brandName, type CryptoCard } from '../lib/cards'

/** Our own illustrated card (issuer colours, chip, network mark): no third-party artwork. */
export default function CardArt({ card, width = 132 }: { card: CryptoCard; width?: number }) {
  const [a, b] = card.brand?.length === 2 ? card.brand : ['#111', '#9945ff']
  const h = Math.round(width / 1.586) // ISO/IEC 7810 ID-1 ratio
  const visa = /visa/i.test(card.network)
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[10px] text-white shadow-[0_10px_30px_rgba(0,0,0,.45)]"
      style={{ width, height: h, background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`, boxShadow: `0 10px 28px ${b}33, inset 0 1px 0 rgba(255,255,255,.25)` }}
      aria-label={`${card.name} card illustration`}
      role="img"
    >
      {/* glossy sweep */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,.22) 48%, transparent 62%)' }} />
      <div className="absolute top-[9%] left-[8%] max-w-[70%] truncate text-[length:var(--fs)] font-bold tracking-tight" style={{ ['--fs' as string]: `${Math.max(9, width * 0.085)}px`, textShadow: '0 1px 2px rgba(0,0,0,.35)' }}>
        {brandName(card)}
      </div>
      {/* contactless */}
      <svg viewBox="0 0 24 24" className="absolute top-[9%] right-[8%] opacity-80" style={{ width: width * 0.11 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8.5 7.5a6 6 0 0 1 0 9M12 5a9.5 9.5 0 0 1 0 14M15.5 2.5a13 13 0 0 1 0 19" />
      </svg>
      {/* EMV chip */}
      <div
        className="absolute left-[8%] rounded-[3px]"
        style={{ top: '40%', width: width * 0.15, height: width * 0.115, background: 'linear-gradient(135deg,#f6e3a1,#c9a646 55%,#f0d987)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.18)' }}
      />
      {card.solana && (
        <div className="absolute bottom-[10%] left-[8%] font-mono font-bold tracking-[0.12em]" style={{ fontSize: Math.max(7, width * 0.055) }}>
          ◎ SOLANA
        </div>
      )}
      <div className="absolute right-[8%] bottom-[8%] font-black italic" style={{ fontSize: Math.max(9, width * (visa ? 0.12 : 0.08)), letterSpacing: visa ? '-0.02em' : 0 }}>
        {visa ? 'VISA' : (
          <span className="inline-flex items-center">
            <span className="inline-block rounded-full bg-[#eb001b]" style={{ width: width * 0.11, height: width * 0.11 }} />
            <span className="-ml-[4%] inline-block rounded-full bg-[#f79e1b] mix-blend-screen" style={{ width: width * 0.11, height: width * 0.11 }} />
          </span>
        )}
      </div>
    </div>
  )
}
