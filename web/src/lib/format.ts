export function ago(ts: number, now = Date.now()) {
  const s = Math.max(1, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export function countdown(ms: number) {
  const t = Math.max(0, ms)
  const W = Math.floor(t / 604800000)
  const D = Math.floor((t % 604800000) / 86400000)
  const H = Math.floor((t % 86400000) / 3600000)
  const M = Math.floor((t % 3600000) / 60000)
  return [W && `${W}W`, `${D}D`, `${H}H`, `${M}M`].filter(Boolean).join(' ')
}

export function timeLabel(ts: number) {
  return new Date(ts).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export const fmtKm = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`)
export const short = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`
export const nf = (n: number) => n.toLocaleString('en-US')
export const uid = () => Math.random().toString(36).slice(2, 10)

/** "15–17 Nov" / "12 Nov" / "31 Oct – 2 Nov" */
export function dayRange(a: number, b: number) {
  const A = new Date(a)
  const B = new Date(b)
  const m = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' })
  if (A.toDateString() === B.toDateString() || b - a < 20 * 3600000) return `${A.getDate()} ${m(A)}`
  if (A.getMonth() === B.getMonth()) return `${A.getDate()}–${B.getDate()} ${m(A)}`
  return `${A.getDate()} ${m(A)} – ${B.getDate()} ${m(B)}`
}
