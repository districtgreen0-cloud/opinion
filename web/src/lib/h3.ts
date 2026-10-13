import { latLngToCell, cellToLatLng, gridDisk, cellToBoundary, gridDistance, getResolution } from 'h3-js'

/**
 * Hex size for the whole app (gating, posts, stats, footprint).
 * res 10 ≈ 0.015 km² per hex (~66 m edge): about a city block, the fine 375go-style grid.
 * Must match H3_RES in worker/wrangler.jsonc, since the server gates posts with the same value.
 */
export const H3_RES = 10
export const H3_AREA_LABEL = '~0.015 km²'

export const toCell = (lat: number, lng: number) => latLngToCell(lat, lng, H3_RES)
export const cellCenter = (cell: string): [number, number] => {
  const [lat, lng] = cellToLatLng(cell)
  return [lng, lat]
}
export const disk = (cell: string, k: number) => gridDisk(cell, k)
export const ringDistance = (a: string, b: string) => gridDistance(a, b)
export const boundaryLngLat = (cell: string) => cellToBoundary(cell, true) as [number, number][]
export const isCurrentRes = (cell: string) => {
  try {
    return getResolution(cell) === H3_RES
  } catch {
    return false
  }
}

// ids within one city share their prefix/suffix; the middle characters are what differ
export const shortCell = (cell: string) => cell.slice(4, 11)
