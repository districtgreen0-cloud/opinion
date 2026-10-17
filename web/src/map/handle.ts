import type * as maplibregl from 'maplibre-gl'

/** The live map, for UI outside the canvas (zoom rail, compass, navigation). Set by Map3D. */
export const mapHandle: { current: maplibregl.Map | null } = { current: null }
