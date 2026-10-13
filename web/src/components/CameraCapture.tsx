import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { compress } from '../lib/memories'
import { reduced } from './bits'

/** Full-screen camera: live view → shutter → Retake / Save. Camera only (no gallery uploads). */
export default function CameraCapture({ onSave, onClose, busy }: { onSave: (p: { full: Blob; thumb: Blob }) => void; onClose: () => void; busy: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [shot, setShot] = useState<{ full: Blob; thumb: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // attach the live stream to whichever <video> is mounted (it remounts after Retake)
  const bindVideo = (el: HTMLVideoElement | null) => {
    video.current = el
    if (el && stream.current && el.srcObject !== stream.current) {
      el.srcObject = stream.current
      el.play().catch(() => {})
    }
  }

  useEffect(() => {
    let cancelled = false
    setError(null)
    setReady(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t open the camera. Try Safari or Chrome over https.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        bindVideo(video.current)
      })
      .catch((e: DOMException) => setError(e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.' : 'No camera found on this device.'))
    return () => {
      cancelled = true
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [facing])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onClose])
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot])

  const snap = async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    if (flash.current && !reduced()) gsap.fromTo(flash.current, { opacity: 0.9 }, { opacity: 0, duration: 0.45, ease: 'power2.out' })
    const r = await compress(v)
    setShot({ ...r, url: URL.createObjectURL(r.full) })
  }

  return (
    <div className="force-dark fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Capture a memory">
      <div className="relative flex-1 overflow-hidden">
        {!shot && <video ref={bindVideo} onLoadedData={(e) => setReady(e.currentTarget.videoWidth > 0)} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />}
        {shot && <img src={shot.url} alt="Your memory" className="absolute inset-0 h-full w-full object-cover" />}
        <div ref={flash} className="pointer-events-none absolute inset-0 bg-white opacity-0" />
        {error && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <p className="max-w-[300px] text-[14px] leading-snug text-white/80">{error}</p>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(16px,env(safe-area-inset-top))]">
          <button onClick={onClose} className="glass-btn grid h-10 w-10 place-items-center !rounded-full !p-0 text-[15px]" aria-label="Close camera">
            ✕
          </button>
          <span className="rounded-full bg-black/50 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-white/70 uppercase">Memory · this hex</span>
          {!shot && !error ? (
            <button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="glass-btn grid h-10 w-10 place-items-center !rounded-full !p-0" aria-label="Switch camera">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
                <path d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.8M14.5 13.5a2.5 2.5 0 0 1-4.3 1.8M13.8 10.2v1.6h-1.6M10.2 16.8v-1.6h1.6" />
              </svg>
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>
      </div>
      <div className="flex h-[132px] shrink-0 items-center justify-center gap-6 bg-black pb-[env(safe-area-inset-bottom)]">
        {!shot ? (
          <div className="flex flex-col items-center gap-2">
            <button onClick={snap} disabled={!!error || !ready} className="grid h-[72px] w-[72px] place-items-center rounded-full border-[3px] border-white disabled:opacity-30" aria-label="Take photo">
              <span className="h-[58px] w-[58px] rounded-full bg-white transition active:scale-90" />
            </button>
            {!ready && !error && <span className="font-mono text-[10px] tracking-[0.2em] text-white/50 uppercase">Starting camera…</span>}
          </div>
        ) : (
          <>
            <button onClick={() => setShot(null)} disabled={busy} className="btn-black min-w-[120px] !rounded-2xl text-[14px]">
              Retake
            </button>
            <button
              onClick={() => onSave({ full: shot.full, thumb: shot.thumb })}
              disabled={busy}
              className="min-w-[120px] rounded-2xl bg-gradient-to-r from-[#9945ff] to-[#14f195] px-4 py-2.5 text-[14px] font-semibold text-black disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
