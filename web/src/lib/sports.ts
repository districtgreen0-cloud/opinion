import { useEffect, useState } from 'react'
import type { City, Game } from './types'

/**
 * Sports venues: real OSM stadiums / arenas / courts (scripts/fetch_sports.py), fixtures from /api/feeds/sports.
 * Kind ids match KINDS in the fetch script.
 */
export const KINDS = ['stadium', 'arena', 'centre', 'soccer', 'tennis', 'basketball', 'baseball', 'field', 'swim', 'ice', 'other'] as const
export type Kind = (typeof KINDS)[number]

export type Major = { n: string; a?: string[]; k: number; s: number; p: [number, number]; c?: number; r?: [number, number][] }
export type Pitch = [number, number, number] // lng, lat, kind

export const KIND_LABEL: Record<Kind, string> = {
  stadium: 'Stadium',
  arena: 'Arena',
  centre: 'Sports centre',
  soccer: 'Football pitch',
  tennis: 'Tennis court',
  basketball: 'Basketball court',
  baseball: 'Baseball field',
  field: 'Rugby · cricket · NFL field',
  swim: 'Pool',
  ice: 'Ice rink',
  other: 'Pitch',
}

// pitch-level colours (stadiums take their sport's colour)
export const KIND_RGB: Record<Kind, [number, number, number]> = {
  stadium: [255, 176, 32],
  arena: [255, 120, 60],
  centre: [0, 194, 255],
  soccer: [20, 241, 149],
  tennis: [214, 255, 58],
  basketball: [255, 138, 31],
  baseball: [255, 92, 120],
  field: [255, 210, 110],
  swim: [90, 170, 255],
  ice: [170, 230, 255],
  other: [178, 107, 255],
}
export const kindOfId = (i: number): Kind => KINDS[i] ?? 'other'
/** stadium/arena tint: by its main sport when OSM knows it */
export const majorRgb = (m: Major): [number, number, number] => (m.s !== 10 ? KIND_RGB[kindOfId(m.s)] : KIND_RGB[kindOfId(m.k)])

export const SPORT_EMOJI: Record<Game['sport'], string> = { soccer: '⚽', basketball: '🏀', football: '🏈', baseball: '⚾', hockey: '🏒', rugby: '🏉', tennis: '🎾', other: '🏟️' }

let MAJORS: Record<string, Major[]> | null = null
let majorsP: Promise<Record<string, Major[]>> | null = null
/** Stadiums / arenas per city (244 KB): fetched once, after the first paint. */
export function loadMajors(): Promise<Record<string, Major[]>> {
  majorsP ??= import('../data/sport-majors.json').then((m) => (MAJORS = (m.default as unknown as { cities: Record<string, Major[]> }).cities))
  return majorsP
}
/** Synchronous view of the venues: empty until loadMajors() resolves. */
export const cityMajors = (id: City['id']): Major[] => MAJORS?.[id] ?? []
/** React: the city's venues, re-rendering once they arrive. */
export function useMajors(id: City['id']): Major[] {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!MAJORS) loadMajors().then(() => bump((v) => v + 1), () => {})
  }, [])
  return cityMajors(id)
}

let pitchesP: Promise<Record<string, Pitch[]>> | null = null
/** ~100–300 KB per city of courts — loaded only when the Sports tab first opens */
export function loadPitches(): Promise<Record<string, Pitch[]>> {
  pitchesP ??= import('../data/sport-pitches.json').then((m) => (m.default as unknown as { cities: Record<string, Pitch[]> }).cities)
  return pitchesP
}

// ── tiny line icons for the map (deck.gl IconLayer, SVG data URLs)
const svg = (body: string, stroke: string) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="rgba(0,0,0,.78)" stroke="${stroke}" stroke-width="3"/><g fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`,
  )
const hex = (k: Kind) => '#' + KIND_RGB[k].map((v) => v.toString(16).padStart(2, '0')).join('')
const BODIES: Partial<Record<Kind, string>> = {
  soccer: '<circle cx="32" cy="32" r="15"/><path d="M32 24l7 5-3 8h-8l-3-8z"/><path d="M32 17v7M39 29l7-3M36 37l4 7M28 37l-4 7M25 29l-7-3"/>',
  tennis: '<circle cx="32" cy="32" r="15"/><path d="M19 24c6 4 6 12 0 16M45 24c-6 4-6 12 0 16"/>',
  basketball: '<circle cx="32" cy="32" r="15"/><path d="M17 32h30M32 17v30M21 21c5 6 5 16 0 22M43 21c-5 6-5 16 0 22"/>',
  baseball: '<circle cx="32" cy="32" r="15"/><path d="M22 21c4 7 4 15 0 22M42 21c-4 7-4 15 0 22"/>',
  field: '<ellipse cx="32" cy="32" rx="17" ry="10" transform="rotate(-35 32 32)"/><path d="M27 37l10-10M29 31l4 4M33 27l4 4"/>',
  swim: '<path d="M16 38c4-3 8-3 12 0s8 3 12 0 6-3 8-1M16 45c4-3 8-3 12 0s8 3 12 0 6-3 8-1"/><circle cx="38" cy="22" r="3"/><path d="M22 33l8-8 8 6"/>',
  ice: '<path d="M18 40h20c4 0 6-2 6-6V22M44 40h4M22 46h24"/>',
  other: '<rect x="18" y="22" width="28" height="20" rx="2"/><path d="M32 22v20"/><circle cx="32" cy="32" r="4"/>',
  stadium: '<ellipse cx="32" cy="34" rx="18" ry="10"/><ellipse cx="32" cy="34" rx="9" ry="4"/><path d="M14 34v-6c0-5 8-9 18-9s18 4 18 9v6"/>',
  arena: '<path d="M14 42V30c0-7 8-12 18-12s18 5 18 12v12z"/><path d="M14 34h36M24 42v-8M40 42v-8"/>',
  centre: '<path d="M16 44V26l16-8 16 8v18z"/><path d="M26 44V34h12v10"/>',
}
export const iconFor = (k: Kind) => ({ url: svg(BODIES[k] ?? BODIES.other!, hex(k)), width: 64, height: 64, id: 'sp-' + k, mask: false })

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const HM = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
/** "LIVE · 67'" · "FT 2–1" · "Sat 15:00" — in the viewer's own time zone */
export function gameWhen(g: Game): string {
  if (g.state === 'live') return `LIVE${g.detail ? ' · ' + g.detail : ''}`
  if (g.state === 'post') return g.detail || 'FT'
  const d = new Date(g.startsAt)
  const today = new Date().toDateString() === d.toDateString()
  return `${today ? 'Today' : DAY.format(d)} ${HM.format(d)}`
}
export const SPORTS_ATTRIBUTION = 'Venues © OpenStreetMap · fixtures ESPN / TheSportsDB'
