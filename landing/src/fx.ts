// Shape helpers for clip-path transitions.

const px = (pts: [number, number][]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`

/** Pointy-top hexagon centred in the box; r = 0..1 of the box's half-diagonal × 1.2. */
export function hex(w: number, h: number, r: number) {
  const R = Math.hypot(w, h) * 0.6 * r
  const cx = w / 2, cy = h / 2
  const pts: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)])
  }
  return px(pts)
}
