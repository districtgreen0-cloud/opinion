import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { Footprint } from '../lib/timeline'
import { nf } from '../lib/format'
import TimelineWorker from '../workers/timeline.worker?worker'

const HOW = [
  ['Android', 'Settings → Location → Location services → Timeline → Export Timeline data → Timeline.json'],
  ['iPhone', 'Google Maps → your profile → Your Timeline → ••• → Location & privacy settings → Export Timeline data'],
  ['Takeout (old)', 'takeout.google.com → Location History → unzip → Records.json or Semantic Location History/*.json'],
]

export default function TimelineImport() {
  const footprint = useStore((s) => s.footprint)
  const show = useStore((s) => s.showFootprint)
  const s = useStore.getState
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  const run = (files: File[]) => {
    if (!files.length) return
    setBusy('Starting…')
    const w = new TimelineWorker()
    w.onmessage = (e: MessageEvent<{ type: string; text?: string; footprint?: Footprint }>) => {
      const m = e.data
      if (m.type === 'progress') setBusy(m.text ?? '…')
      if (m.type === 'error') {
        setBusy(null)
        s().toast(`Couldn't read that file: ${m.text}`, 'ember')
        w.terminate()
      }
      if (m.type === 'done' && m.footprint) {
        setBusy(null)
        w.terminate()
        const fp = m.footprint
        if (!fp.points) return s().toast('No locations found in that file', 'ember')
        s().setFootprint(fp)
        s().toast(`Footprint imported · ${nf(Object.keys(fp.cells).length)} hexes`, 'mint')
        const top = fp.places[0]
        if (top) s().flyTo(top.lng, top.lat, 14.5)
      }
    }
    w.postMessage(files)
  }

  const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—')

  return (
    <div className="rounded-2xl border hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] text-white">Google location history</div>
          <div className="text-[12px] text-fog">Map your Timeline as a private footprint. Parsed on this device and never uploaded.</div>
        </div>
        {footprint && (
          <button role="switch" aria-checked={show} aria-label="Show footprint" onClick={() => s().toggleFootprint(!show)} className={`relative h-7 w-12 shrink-0 rounded-full border transition ${show ? 'border-white/40 bg-white/15' : 'border-white/10 bg-white/[.03]'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full transition-all ${show ? 'left-6 bg-white' : 'left-1 bg-white/30'}`} />
          </button>
        )}
      </div>

      {footprint && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            [nf(Object.keys(footprint.cells).length), 'hexes'],
            [nf(footprint.points), 'points'],
            [`${fmtDate(footprint.from)} – ${fmtDate(footprint.to)}`, 'range'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/[.03] px-2 py-2">
              <div className="num truncate text-[13px] text-white">{v}</div>
              <div className="text-[9px] tracking-[0.16em] text-fog uppercase">{l}</div>
            </div>
          ))}
        </div>
      )}

      {footprint && footprint.places.length > 0 && (
        <ul className="mt-3 space-y-1">
          {footprint.places.slice(0, 5).map((p) => (
            <li key={p.cell}>
              <button onClick={() => s().flyTo(p.lng, p.lat, 16.4)} className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-[12px] hover:bg-white/[.04]">
                <span className="truncate text-white/85">{p.name || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}</span>
                <span className="num shrink-0 text-fog">{p.visits}×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-ghost text-[13px]" disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ?? (footprint ? 'Re-import' : 'Import Timeline')}
        </button>
        {footprint && (
          <button className="btn-ghost text-[13px] !text-fog" onClick={() => s().setFootprint(null)}>
            Delete
          </button>
        )}
        <button className="btn-ghost text-[13px] !text-fog" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
          How to export
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={(e) => {
          run([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      {help && (
        <dl className="mt-3 space-y-2 text-[11.5px] leading-relaxed">
          {HOW.map(([k, v]) => (
            <div key={k}>
              <dt className="text-white/80">{k}</dt>
              <dd className="text-fog">{v}</dd>
            </div>
          ))}
          <p className="text-white/30">Unzip Takeout first. You can select several monthly files at once.</p>
        </dl>
      )}
    </div>
  )
}
