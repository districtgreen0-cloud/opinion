import { LIVE } from './api'

/** Friend requests (client). Mirrors worker/src/friends.ts. */
const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = (RAW ?? '').replace(/\/$/, '')

export type ServerLink = { handle: string; avatar: string; status: 'friends' | 'pending' | 'incoming'; since: number }
export type FriendsResult = { ok: true; links: ServerLink[] } | { ok: false; error: string }

async function call(path: string, body?: unknown): Promise<FriendsResult> {
  if (!LIVE) return { ok: false, error: 'demo' }
  try {
    const r = await fetch(`${BASE}/api/friends${path}`, {
      credentials: 'include',
      ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    })
    const j = (await r.json().catch(() => ({}))) as { links?: ServerLink[]; error?: string }
    return r.ok && j.links ? { ok: true, links: j.links } : { ok: false, error: j.error ?? 'error' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export const fetchFriends = () => call('')
export const requestFriend = (handle: string) => call('/request', { handle })
export const acceptFriend = (handle: string) => call('/accept', { handle })
export const removeFriendLink = (handle: string) => call('/remove', { handle })
