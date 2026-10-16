import { LIVE } from './api'

/**
 * Account sign-in: Google OAuth + email one-time code (no passwords). Backend: worker/src/auth.ts.
 * Demo build (no backend): the email code is shown on screen and Google is simulated, so the flow can be tried.
 */
export type Account = {
  id: string
  email: string | null
  name: string | null
  picture: string | null
  handle: string
  avatar: string
  providers: ('google' | 'email')[]
  createdAt: number
}

const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = (RAW ?? '').replace(/\/$/, '')
export const AUTH_DEMO = !LIVE
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

const call = async <T,>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; data?: Record<string, unknown> }> => {
  try {
    const r = await fetch(`${BASE}${path}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...init })
    const data = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, data: data as T } : { ok: false, status: r.status, error: (data as { error?: string }).error ?? 'error', data }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}

// ── demo helpers (local only)
const demoCodes = new Map<string, string>()
const handleFrom = (email: string) => '@' + (email.split('@')[0] ?? 'you').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 18).padEnd(2, '0')
const demoAccount = (email: string, provider: 'google' | 'email', name: string | null = null): Account => ({
  id: 'demo_' + Math.random().toString(36).slice(2, 10),
  email,
  name,
  picture: null,
  handle: handleFrom(email),
  avatar: `av:${[...email].reduce((a, c) => a + c.charCodeAt(0), 0) % 8}`,
  providers: [provider],
  createdAt: Date.now(),
})

export type AuthIntent = 'signin' | 'signup'

export async function emailStart(email: string, intent: AuthIntent = 'signin'): Promise<{ ok: true; devCode?: string } | { ok: false; error: string; retryAfter?: number }> {
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' }
  if (AUTH_DEMO) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    demoCodes.set(email.toLowerCase(), code)
    return { ok: true, devCode: code }
  }
  const r = await call<{ ok: true; devCode?: string }>('/api/auth/email/start', { method: 'POST', body: JSON.stringify({ email, intent }) })
  if (r.ok) return { ok: true, devCode: r.data.devCode }
  return { ok: false, error: r.error, retryAfter: r.data?.retryAfter as number | undefined }
}

export async function emailVerify(email: string, code: string): Promise<{ ok: true; account: Account } | { ok: false; error: string; attemptsLeft?: number }> {
  if (AUTH_DEMO) {
    return demoCodes.get(email.toLowerCase()) === code.trim() ? { ok: true, account: demoAccount(email.toLowerCase(), 'email') } : { ok: false, error: 'invalid_code' }
  }
  const r = await call<{ account: Account }>('/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ email, code: code.trim() }) })
  return r.ok ? { ok: true, account: r.data.account } : { ok: false, error: r.error, attemptsLeft: r.data?.attemptsLeft as number | undefined }
}

export const googleUrl = () => `${BASE}/api/auth/google/start?redirect=${encodeURIComponent(location.pathname || '/')}`

/** Real: full-page redirect to Google (returns here signed in). Demo: simulated account for the given Gmail. */
export function googleStart(demoEmail?: string): Account | null {
  if (AUTH_DEMO) return demoEmail && EMAIL_RE.test(demoEmail) ? demoAccount(demoEmail.toLowerCase(), 'google', demoEmail.split('@')[0]) : null
  location.href = googleUrl()
  return null
}

export async function fetchMe(): Promise<Account | null> {
  if (AUTH_DEMO) return null
  const r = await call<{ account: Account }>('/api/auth/me')
  return r.ok ? r.data.account : null
}

export async function logout(): Promise<void> {
  if (!AUTH_DEMO) await call('/api/auth/logout', { method: 'POST' })
}

export async function updateProfile(p: { handle?: string; avatar?: string }): Promise<{ ok: boolean; error?: string }> {
  if (AUTH_DEMO) return { ok: true }
  const r = await call<{ account: Account }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(p) })
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
