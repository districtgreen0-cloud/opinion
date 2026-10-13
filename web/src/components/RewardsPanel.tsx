import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { countdown, nf } from '../lib/format'
import { Panel, Ticker } from './bits'

export default function RewardsPanel() {
  const epochs = useStore((s) => s.epochs)
  const claimed = useStore((s) => s.claimed)
  const points = useStore((s) => s.points)
  const visited = useStore((s) => s.visited.length)
  const wallet = useStore((s) => s.wallet)
  const s = useStore.getState
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const active = epochs[0]
  const pending = points * 0.42 // demo conversion: share of the epoch pool

  return (
    <Panel kicker="$ON · Solana" title="Rewards" onClose={() => s().setTab('explore')}>
      <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-black p-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] tracking-[0.2em] text-fog uppercase">Epoch {active.n} · active</span>
          <span className="flex items-center gap-1.5 text-[11px] text-ember"><span className="live-dot ember-dot" /> earning</span>
        </div>
        <div className="num mt-3 text-[34px] font-bold leading-none text-white">{countdown(active.endsAt - now)}</div>
        <div className="mt-1 text-[12px] text-fog">until epoch {active.n} settles</div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Kpi label="Points" value={<Ticker value={points} />} />
          <Kpi label="Hexes" value={<Ticker value={visited} />} />
          <Kpi label="Pending" value={<><Ticker value={pending} decimals={0} /> <span className="text-[11px] text-fog">$ON</span></>} />
        </div>
      </div>

      <h3 className="mt-6 mb-2 text-[11px] tracking-[0.2em] text-fog uppercase">Past epochs</h3>
      <div className="space-y-2">
        {epochs.slice(1).map((e) => {
          const done = claimed.includes(e.n)
          return (
            <div key={e.n} className="flex items-center justify-between rounded-2xl border hairline px-4 py-3">
              <div>
                <div className="text-[14px] text-white">Epoch {e.n}</div>
                <div className="num text-[12px] text-fog">{nf(e.earned)} $ON</div>
              </div>
              <button
                className={done ? 'btn-ghost text-[12px] !text-fog' : 'btn-ember text-[12px]'}
                disabled={done}
                onClick={() => {
                  if (!wallet) return s().toast('Connect a wallet to claim', 'ember')
                  s().claim(e.n)
                  s().toast(`Claimed ${nf(e.earned)} $ON · merkle proof verified`, 'mint')
                }}
              >
                {done ? 'Claimed' : 'Claim'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <a className="btn-ghost text-center text-[13px]" href={wallet ? `https://solscan.io/account/${wallet.address}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!wallet} onClick={(e) => !wallet && (e.preventDefault(), s().toast('Connect a wallet first'))}>
          View wallet ↗
        </a>
        <button className="btn-ghost text-[13px]" onClick={() => s().setTab('explore')}>Go explore</button>
      </div>

      <div className="mt-6 space-y-2 text-[12px] leading-relaxed text-fog">
        <p><b className="text-white/80">How you earn:</b> +25 first visit to a hex · +10 per voice · +1 every 3s while your radar overlaps a live venue.</p>
        <p><b className="text-white/80">How it pays:</b> each epoch's 1,000,000 $ON pool is split pro-rata by points and claimed with a merkle proof.</p>
      </div>
    </Panel>
  )
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="num text-[18px] font-semibold text-white">{value}</div>
      <div className="text-[10px] tracking-[0.16em] text-fog uppercase">{label}</div>
    </div>
  )
}
