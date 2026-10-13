// 8 generated gradient avatars — pure SVG data URIs, no assets to ship.
const PALETTES: [string, string, string][] = [
  ['#ff5a1f', '#b26bff', 'M'],
  ['#3dffa8', '#0b6b5a', 'S'],
  ['#b26bff', '#2b0b5e', 'N'],
  ['#ffd23d', '#ff5a1f', 'K'],
  ['#5ad1ff', '#1b2f8f', 'A'],
  ['#ff3d8b', '#4b0b2e', 'R'],
  ['#e8e8ee', '#3a3a44', 'J'],
  ['#7cff3d', '#13401a', 'L'],
]

function svg(i: number, letter?: string) {
  const [a, b, l] = PALETTES[i % PALETTES.length]
  const ch = (letter ?? l).slice(0, 1).toUpperCase()
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><circle cx="46" cy="16" r="10" fill="#fff" opacity=".18"/><text x="32" y="41" font-family="Space Grotesk,Inter,sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#000" opacity=".72">${ch}</text></svg>`,
    )
  )
}

export const AVATARS = PALETTES.map((_, i) => `av:${i}`)
export const AVATAR_COLORS = PALETTES.map((p) => p[0])

/** Avatars are stored as compact ids ("av:3") and rendered on demand. */
export function avatarSrc(id: string, handle?: string): string {
  if (id.startsWith('av:')) return svg(Number(id.slice(3)), handle?.replace(/^@/, ''))
  if (/^(https?:|data:)/.test(id)) return id
  // unknown id from the API → stable generated avatar
  return svg([...id].reduce((a, c) => a + c.charCodeAt(0), 0), handle?.replace(/^@/, ''))
}
export function avatarColor(id: string): string {
  return id.startsWith('av:') ? AVATAR_COLORS[Number(id.slice(3)) % 8] : '#b26bff'
}
