import { useEffect, useState } from 'react'
import { LIVE } from './api'

/**
 * Memories: one camera photo per person per hex, 3 per day. Never drawn on the map.
 * Demo / share preview: photos live in this browser (IndexedDB). Live: R2 via /api/memories (same limits, enforced server-side).
 */
export type Memory = { id: string; cell: string; handle: string; avatar: string; createdAt: number; thumb: string; full: string }
type Meta = Omit<Memory, 'thumb' | 'full'>

export const PER_DAY = 3
const RAW = import.meta.env.VITE_API_URL as string | undefined
const BASE = LIVE ? (RAW ?? '').replace(/\/$/, '') : ''
const META_KEY = 'opinion:memories'

// ── tiny IndexedDB blob store (demo)
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('opinion-memories', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('blobs')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const req = fn(d.transaction('blobs', mode).objectStore('blobs'))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
const readMeta = (): Meta[] => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '[]') as Meta[]
  } catch {
    return []
  }
}
const writeMeta = (m: Meta[]) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* private mode */
  }
}

// ── change notifications so every open hex sheet refreshes
const subs = new Set<() => void>()
const changed = () => subs.forEach((f) => f())

// ── capture → two compressed images (WebP if supported, else JPEG). Drawing to a canvas also drops all EXIF/GPS.
async function encode(src: CanvasImageSource, w: number, h: number, max: number, q: number): Promise<Blob> {
  const s = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  const as = (type: string) => new Promise<Blob | null>((r) => c.toBlob(r, type, q))
  const webp = await as('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  return (await as('image/jpeg'))!
}
export async function compress(video: HTMLVideoElement): Promise<{ full: Blob; thumb: Blob }> {
  const w = video.videoWidth
  const h = video.videoHeight
  return { full: await encode(video, w, h, 1440, 0.82), thumb: await encode(video, w, h, 360, 0.72) }
}

export function limitsFor(handle: string, cell: string, list: Memory[] | Meta[] = readMeta()) {
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const mine = list.filter((m) => m.handle === handle)
  const today = mine.filter((m) => m.createdAt >= dayStart).length
  return { hexTaken: mine.some((m) => m.cell === cell), today, left: Math.max(0, PER_DAY - today) }
}

export type SaveResult = { ok: true; memory: Memory } | { ok: false; reason: 'hex_limit' | 'daily_limit' | 'not_here' | 'sign_in' | 'error' }

export async function saveMemory(p: { cell: string; lat: number; lng: number; handle: string; avatar: string; full: Blob; thumb: Blob }): Promise<SaveResult> {
  if (!LIVE) {
    const l = limitsFor(p.handle, p.cell)
    if (l.hexTaken) return { ok: false, reason: 'hex_limit' }
    if (!l.left) return { ok: false, reason: 'daily_limit' }
    const meta: Meta = { id: crypto.randomUUID(), cell: p.cell, handle: p.handle, avatar: p.avatar, createdAt: Date.now() }
    try {
      await idb('readwrite', (s) => s.put({ full: p.full, thumb: p.thumb }, meta.id))
    } catch {
      return { ok: false, reason: 'error' }
    }
    writeMeta([meta, ...readMeta()])
    changed()
    return { ok: true, memory: { ...meta, full: URL.createObjectURL(p.full), thumb: URL.createObjectURL(p.thumb) } }
  }
  const fd = new FormData()
  fd.set('cell', p.cell)
  fd.set('lat', String(p.lat))
  fd.set('lng', String(p.lng))
  fd.set('full', p.full, 'full')
  fd.set('thumb', p.thumb, 'thumb')
  try {
    const r = await fetch(`${BASE}/api/memories`, { method: 'POST', body: fd, credentials: 'include' })
    if (r.status === 409) return { ok: false, reason: 'hex_limit' }
    if (r.status === 429) return { ok: false, reason: 'daily_limit' }
    if (r.status === 403) return { ok: false, reason: 'not_here' }
    if (r.status === 401) return { ok: false, reason: 'sign_in' }
    if (!r.ok) return { ok: false, reason: 'error' }
    const j = (await r.json()) as { memory: Memory }
    changed()
    return { ok: true, memory: { ...j.memory, full: BASE + j.memory.full, thumb: BASE + j.memory.thumb } }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export async function reportMemory(id: string) {
  if (LIVE) await fetch(`${BASE}/api/memories/${id}/report`, { method: 'POST', credentials: 'include' }).catch(() => {})
}

async function loadCell(cell: string): Promise<Memory[]> {
  if (LIVE) {
    try {
      const r = await fetch(`${BASE}/api/memories?cell=${cell}`)
      const j = (await r.json()) as { memories?: Memory[] }
      return (j.memories ?? []).map((m) => ({ ...m, full: BASE + m.full, thumb: BASE + m.thumb }))
    } catch {
      return []
    }
  }
  const metas = readMeta().filter((m) => m.cell === cell)
  const out: Memory[] = []
  for (const m of metas) {
    const b = await idb<{ full: Blob; thumb: Blob } | undefined>('readonly', (s) => s.get(m.id)).catch(() => undefined)
    if (b) out.push({ ...m, full: URL.createObjectURL(b.full), thumb: URL.createObjectURL(b.thumb) })
  }
  return out
}

/** Memories of one hex, refreshed after every save. */
export function useHexMemories(cell: string): Memory[] {
  const [list, setList] = useState<Memory[]>([])
  useEffect(() => {
    let alive = true
    let urls: string[] = []
    const load = () =>
      loadCell(cell).then((l) => {
        if (!alive) return
        urls.forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u))
        urls = l.flatMap((m) => [m.full, m.thumb])
        setList(l)
      })
    load()
    subs.add(load)
    return () => {
      alive = false
      subs.delete(load)
      urls.forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u))
    }
  }, [cell])
  return list
}
