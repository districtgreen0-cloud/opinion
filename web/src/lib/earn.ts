import { latLngToCell } from 'h3-js'
import { LIVE } from './api'

/**
 * Earn mode (client). Opt-in, per-tier consent. Mirrors worker/src/earn.ts.
 * Demo / share preview: everything stays in this browser (nothing is sent or sold).
 * Live: events are batched to /api/earn/events every minute, only for tiers the user agreed to.
 */
export const TERMS_VERSION = '2026-10-v1'
export const TERMS = [
  'Earn mode is optional. OPINION works fully without it, and you can pause or stop any time.',
  'You choose what to share, tier by tier, below.',
  'Never collected: contacts, messages, browsing, cookies from other sites, data from other apps.',
  'Locations are coarsened to ~0.7 km² areas and hourly buckets on your device. No GPS trail.',
  'Buyers only see aggregates of 50+ people, with statistical noise, 24 h later. Never data about you.',
  'Raw contributions are deleted after 90 days. Export or delete everything from “My data” at any time.',
]
export type Tier = 'presence' | 'observations' | 'interests'
export const TIER_INFO: Record<Tier, { title: string; what: string; earn: string }> = {
  presence: { title: 'Presence', what: 'Which ~0.7 km² area you are in, by the hour, while the app is open.', earn: '+1 pt / 5 min' },
  observations: { title: 'Observations', what: 'Your answers to quick “how busy is it?” prompts and the kind of post you make (not its text).', earn: '+10 pts / answer' },
  interests: { title: 'Interests', what: 'Categories you open (events, sports, jobs…). Shared only as city-wide shares.', earn: '+1 pt / category / day' },
}

export type EarnEvent = { tier: Tier; kind: 'dwell' | 'busy' | 'post' | 'follow'; cell?: string; t: number; value?: string | number; sent?: boolean }
export type Consent = { version: string; tiers: Record<Tier, boolean>; at: number; receipt?: string }

const KEY = 'opinion:earnLog'
const MAX_LOCAL = 1500
const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = LIVE ? (RAW ?? '').replace(/\/$/, '') : ''

export const coarseCell = (lat: number, lng: number) => latLngToCell(lat, lng, 8) // done on-device: res 10 never leaves

export function readLog(): EarnEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as EarnEvent[]
  } catch {
    return []
  }
}
function writeLog(l: EarnEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l.slice(-MAX_LOCAL)))
  } catch {
    /* private mode */
  }
}
export function record(e: EarnEvent) {
  writeLog([...readLog(), e])
}

/** Live mode: send unsent events in one batch. Demo: nothing leaves the device. */
export async function flush(): Promise<void> {
  if (!LIVE) return
  const log = readLog()
  const pending = log.filter((e) => !e.sent).slice(0, 200)
  if (!pending.length) return
  try {
    const r = await fetch(`${BASE}/api/earn/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: pending.map(({ sent: _s, ...e }) => e) }),
    })
    if (r.ok) writeLog(log.map((e) => (pending.includes(e) ? { ...e, sent: true } : e)))
  } catch {
    /* offline: retried next minute */
  }
}

export async function sendConsent(c: Consent): Promise<{ ok: boolean; receipt?: string; error?: string }> {
  if (!LIVE) return { ok: true }
  try {
    const r = await fetch(`${BASE}/api/earn/consent`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: c.version, tiers: c.tiers }) })
    const j = (await r.json()) as { consent?: { receipt: string }; error?: string }
    return r.ok ? { ok: true, receipt: j.consent?.receipt } : { ok: false, error: j.error }
  } catch {
    return { ok: false, error: 'network' }
  }
}
export async function withdrawConsent() {
  if (LIVE) await fetch(`${BASE}/api/earn/withdraw`, { method: 'POST', credentials: 'include' }).catch(() => {})
}

/** Download everything we hold about you (server copy in live mode, this browser's log in demo). */
export async function exportMine(consent: Consent | null) {
  let data: unknown = { mode: 'demo · stored only in this browser', terms: { version: TERMS_VERSION, summary: TERMS }, consent, events: readLog() }
  if (LIVE) {
    try {
      const r = await fetch(`${BASE}/api/earn/export`, { credentials: 'include' })
      if (r.ok) data = await r.json()
    } catch {
      /* fall back to the local copy */
    }
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `opinion-my-data-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function deleteMine() {
  writeLog([])
  if (LIVE) await fetch(`${BASE}/api/earn/delete`, { method: 'POST', credentials: 'include' }).catch(() => {})
}

export const describe = (e: EarnEvent) =>
  e.kind === 'dwell' ? 'Presence · area ' + (e.cell ?? '').slice(0, 8) + '…' : e.kind === 'busy' ? `Busy answer · ${e.value}/5` : e.kind === 'post' ? `Posted a ${e.value}` : `Opened ${e.value}`
