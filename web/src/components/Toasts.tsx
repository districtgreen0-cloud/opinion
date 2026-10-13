import { useStore } from '../store'

const TONE = { ember: '#ff5a1f', violet: '#b26bff', mint: '#3dffa8' }

export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[118px] md:top-[128px] z-40 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-strong animate-[toast_.5s_var(--ease-expo)] rounded-2xl px-4 py-2.5 text-[13px] text-white"
          style={t.tone ? { borderColor: TONE[t.tone] + '55', boxShadow: `0 0 28px ${TONE[t.tone]}22` } : undefined}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
