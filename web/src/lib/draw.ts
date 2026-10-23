import { LIVE } from './api'

/** Hex lottery (client). Mirrors worker/src/draw.ts. Demo / share preview: no backend → explanation only. */
const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = (RAW ?? '').replace(/\/$/, '')

export type DrawStatus = 'upcoming' | 'open' | 'closed' | 'drawn'
export type Draw = {
  id: string
  title: string
  prize: string
  xAccount: string
  startsAt: number
  endsAt: number
  status: DrawStatus
  commitHash: string | null
  committedAt: number | null
  entriesCount: number
  seed?: string
  anchor?: string
  entriesRoot?: string
  winnerIndex?: number
  winnerLeaf?: string
  drawnAt?: number
  winner: { handle: string; avatar: string; xHandle: string; cell: string } | null
}
export type DrawMe = { xHandle: string | null; entered: boolean; cell: string | null; enteredAt: number | null; won: boolean }
export type DrawState = { draw: Draw | null; me: DrawMe | null }

export const X_RE = /^[a-z0-9_]{1,15}$/

export async function fetchDraw(): Promise<DrawState> {
  if (!LIVE) return { draw: null, me: null }
  try {
    const r = await fetch(`${BASE}/api/draw`, { credentials: 'include' })
    if (!r.ok) return { draw: null, me: null }
    return (await r.json()) as DrawState
  } catch {
    return { draw: null, me: null }
  }
}

export async function setXHandle(xHandle: string): Promise<{ ok: true; xHandle: string } | { ok: false; reason: 'sign_in' | 'invalid' | 'taken' | 'error' }> {
  const x = xHandle.trim().replace(/^@/, '').toLowerCase()
  if (!X_RE.test(x)) return { ok: false, reason: 'invalid' }
  if (!LIVE) return { ok: true, xHandle: x }
  try {
    const r = await fetch(`${BASE}/api/draw/x`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ xHandle: x }) })
    if (r.status === 401) return { ok: false, reason: 'sign_in' }
    if (r.status === 409) return { ok: false, reason: 'taken' }
    if (!r.ok) return { ok: false, reason: 'invalid' }
    return { ok: true, xHandle: x }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export const proofUrl = (id: string) => `${BASE}/api/draw/${id}/proof`
