import type { Comment, JobStatus, PostKind } from './types'
import { toCell } from './h3'
import { uid } from './format'

/** Set VITE_API_URL (e.g. http://localhost:8787, or "" for same-origin on Workers) to go live. */
const RAW = import.meta.env.VITE_API_URL as string | undefined
export const LIVE = RAW !== undefined && RAW !== 'demo'
const BASE = (RAW ?? '').replace(/\/$/, '')

export type PostResult =
  | { ok: true; comment: Comment }
  | { ok: false; reason: 'not_here' | 'rate_limited' | 'wallet_required' | 'invalid' | 'error'; yourCell?: string }

export async function postComment(
  cell: string,
  body: { text: string; lat: number; lng: number; handle: string; avatar: string; wallet?: string; kind?: PostKind; title?: string; parentId?: string; priceUsdc?: number },
): Promise<PostResult> {
  if (!LIVE) {
    // demo mode mirrors the server rule exactly
    const yourCell = toCell(body.lat, body.lng)
    if (yourCell !== cell) return { ok: false, reason: 'not_here', yourCell }
    if (body.kind === 'job' && !body.wallet) return { ok: false, reason: 'wallet_required' }
    const { lat: _lat, lng: _lng, ...rest } = body
    void _lat
    void _lng
    return { ok: true, comment: { id: uid(), cell, createdAt: Date.now(), ...rest, ...(body.kind === 'job' ? { jobStatus: 'open' as const } : {}) } }
  }
  try {
    const res = await fetch(`${BASE}/api/hex/${cell}/comments`, {
      method: 'POST',
      credentials: 'include', // the session links the post to the account (hex lottery entries)
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 403) return { ok: false, reason: 'not_here', ...(await res.json()) }
    if (res.status === 429) return { ok: false, reason: 'rate_limited' }
    if (res.status === 400) {
      const e = await res.json().catch(() => ({}))
      return { ok: false, reason: e.error === 'wallet_required' ? 'wallet_required' : 'invalid' }
    }
    if (!res.ok) return { ok: false, reason: 'error' }
    const data = await res.json()
    return { ok: true, comment: (data.comment ?? data) as Comment }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export async function fetchFeed(): Promise<Comment[] | null> {
  if (!LIVE) return null
  try {
    const r = await fetch(`${BASE}/api/feed`)
    if (!r.ok) return null
    const d = await r.json()
    return (Array.isArray(d) ? d : d.comments) as Comment[]
  } catch {
    return null
  }
}

export function hexSocket(cell: string, onComment: (c: Comment) => void): () => void {
  if (!LIVE) return () => {}
  const url = (BASE || location.origin).replace(/^http/, 'ws') + `/api/hex/${cell}/ws`
  let ws: WebSocket | null = new WebSocket(url)
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data)
      if (m.type === 'comment' || m.type === 'job') onComment(m.comment)
    } catch {
      /* ignore */
    }
  }
  return () => {
    ws?.close()
    ws = null
  }
}

// ── P2P USDC job escrow ────────────────────────────────────────────────────
// Intended on-chain flow (Solana): `fund` deposits the USDC into a program-owned escrow (PDA);
// `release` pays the worker's wallet; `cancel` refunds the poster before anyone takes the job.
export type JobAction = 'fund' | 'take' | 'deliver' | 'release' | 'cancel'

const NEXT: Record<JobAction, { from: JobStatus[]; to: JobStatus; who: 'poster' | 'worker' | 'other' }> = {
  fund: { from: ['open'], to: 'funded', who: 'poster' },
  take: { from: ['funded'], to: 'taken', who: 'other' },
  deliver: { from: ['taken'], to: 'delivered', who: 'worker' },
  release: { from: ['delivered'], to: 'paid', who: 'poster' },
  cancel: { from: ['open', 'funded'], to: 'cancelled', who: 'poster' },
}

/** Which actions this wallet may take on this job right now (drives the buttons). */
export function jobActions(job: Comment, wallet?: string, handle?: string): JobAction[] {
  if (!wallet) return []
  const poster = job.wallet === wallet
  const worker = job.workerWallet === wallet || (!!handle && job.workerHandle === handle && !job.workerWallet)
  return (Object.keys(NEXT) as JobAction[]).filter((a) => {
    const t = NEXT[a]
    if (!t.from.includes(job.jobStatus ?? 'open')) return false
    return t.who === 'poster' ? poster : t.who === 'worker' ? worker : !poster
  })
}

export type JobResult = { ok: true; job: Comment } | { ok: false; reason: 'forbidden' | 'bad_state' | 'error' }

export async function jobAction(job: Comment, action: JobAction, wallet: string, handle: string): Promise<JobResult> {
  if (!LIVE) {
    if (!jobActions(job, wallet, handle).includes(action)) return { ok: false, reason: 'forbidden' }
    const patch: Partial<Comment> = { jobStatus: NEXT[action].to }
    if (action === 'take') Object.assign(patch, { workerHandle: handle, workerWallet: wallet })
    return { ok: true, job: { ...job, ...patch } }
  }
  try {
    const res = await fetch(`${BASE}/api/jobs/${job.id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, handle }),
    })
    if (res.status === 403) return { ok: false, reason: 'forbidden' }
    if (res.status === 409) return { ok: false, reason: 'bad_state' }
    if (!res.ok) return { ok: false, reason: 'error' }
    return { ok: true, job: (await res.json()).job as Comment }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export async function fetchJobs(): Promise<Comment[] | null> {
  if (!LIVE) return null
  try {
    const r = await fetch(`${BASE}/api/jobs?status=all`)
    return r.ok ? ((await r.json()).jobs as Comment[]) : null
  } catch {
    return null
  }
}
