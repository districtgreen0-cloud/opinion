import type { StyleSpecification } from 'maplibre-gl'
import type { Lighting } from '../store'

/** OSM poi classes that matter for a night-out map. */
export const PLACE_CLASSES = [
  'bar', 'beer', 'cafe', 'restaurant', 'fast_food', 'ice_cream', 'music', 'theatre', 'cinema',
  'art_gallery', 'museum', 'attraction', 'nightclub', 'alcohol_shop', 'park', 'stadium',
]

/** Per-preset palette. Everything is near-black; only light changes. */
export type MapLook = Lighting | 'day'

export const LIGHTING: Record<
  MapLook,
  { bg: string; water: string; park: string; road: string; roadMajor: string; building: string; buildingTop: string; sky: string; horizon: string; fog: string; light: string; label: string; street: string; place: string; placeDot: string; halo?: string }
> = {
  midnight: {
    bg: '#050608', water: '#03060c', park: '#0a0f0c', road: '#2b2e38', roadMajor: '#464a5a',
    building: '#1f2536', buildingTop: '#5a6584', sky: '#000000', horizon: '#0a0a0f', fog: '#000000', light: '#ffffff', label: '#6c7080', street: '#9aa0b4', place: '#8a8a96', placeDot: '#b26bff',
  },
  neon: {
    bg: '#06030e', water: '#030010', park: '#0b0716', road: '#2f2448', roadMajor: '#4e3b78',
    building: '#2a1d4a', buildingTop: '#7556b8', sky: '#05010d', horizon: '#2a0f4d', fog: '#0a0418', light: '#ffffff', label: '#8270a6', street: '#b3a1d8', place: '#a28fc4', placeDot: '#c08bff',
  },
  // light theme: paper-grey ground, white streets, pale glassy buildings
  day: {
    bg: '#e9ebf0', water: '#c4d3e6', park: '#d9e6d8', road: '#ffffff', roadMajor: '#ffffff',
    building: '#d3d8e2', buildingTop: '#f8f9fc', sky: '#f2f4f9', horizon: '#ffffff', fog: '#e9ebf0', light: '#ffffff', label: '#7a7f8d', street: '#4f5566', place: '#3f4454', placeDot: '#9945ff', halo: '#ffffff',
  },
  dusk: {
    bg: '#080403', water: '#050204', park: '#0d0906', road: '#3a2a20', roadMajor: '#5e4231',
    building: '#33221a', buildingTop: '#8a5c42', sky: '#050201', horizon: '#3d1405', fog: '#0a0402', light: '#ffb38a', label: '#8f6a56', street: '#c9a088', place: '#b08a74', placeDot: '#ff7a3d',
  },
}

export function buildStyle(l: MapLook): StyleSpecification {
  const p = LIGHTING[l]
  const halo = p.halo ?? '#000'
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    sky: {
      'sky-color': p.sky,
      'horizon-color': p.horizon,
      'fog-color': p.fog,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.35,
      'atmosphere-blend': 0,
    },
    light: { anchor: 'map', color: p.light, intensity: 0.4, position: [1.4, 210, 35] },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': p.bg } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park } },
      {
        id: 'landuse',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['park', 'grass', 'cemetery', 'pitch']]],
        paint: { 'fill-color': p.park },
      },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
      {
        id: 'water-edge',
        type: 'line',
        source: 'omt',
        'source-layer': 'water',
        paint: { 'line-color': p.roadMajor, 'line-width': 0.6, 'line-opacity': 0.6 },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track', 'path']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.road,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.4, 16, 3, 19, 14],
        },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'trunk', 'motorway']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.roadMajor,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, 0.6, 16, 6, 19, 26],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': p.roadMajor, 'line-width': 0.8, 'line-dasharray': [2, 3] },
      },
      {
        id: 'buildings',
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8],
            0, p.building, 45, p.buildingTop,
          ],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, ['coalesce', ['get', 'render_height'], 8]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.55, // translucent glass city: streets and landmarks show through
          'fill-extrusion-vertical-gradient': true,
        },
      },
      // ── street names (OSM) — appear as you zoom in, follow the road line
      {
        id: 'street-names-major',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 13.5,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'trunk', 'motorway']]],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 13],
          'text-letter-spacing': 0.08,
          'text-max-angle': 30,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': p.street, 'text-halo-color': halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'street-names-minor',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 15.2,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'pedestrian', 'path']]],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 9, 18, 12],
          'text-max-angle': 30,
          'symbol-spacing': 260,
        },
        paint: { 'text-color': p.street, 'text-opacity': 0.8, 'text-halo-color': halo, 'text-halo-width': 1.2 },
      },
      // ── places (OSM points of interest): the open, legal stand-in for Google Maps places
      {
        id: 'places-dot',
        type: 'circle',
        source: 'omt',
        'source-layer': 'poi',
        minzoom: 15,
        filter: ['in', ['get', 'class'], ['literal', PLACE_CLASSES]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 3.2],
          'circle-color': p.placeDot,
          'circle-opacity': 0.55,
          'circle-stroke-color': halo,
          'circle-stroke-width': 1,
          'circle-pitch-alignment': 'map',
        },
      },
      {
        id: 'places',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'poi',
        minzoom: 16.3,
        filter: ['all', ['in', ['get', 'class'], ['literal', PLACE_CLASSES]], ['has', 'name']],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10.5,
          'text-anchor': 'top',
          'text-offset': [0, 0.6],
          'text-max-width': 9,
          'text-padding': 14, // keep the city calm: fewer, spaced-out names
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': p.place, 'text-opacity': 0.8, 'text-halo-color': halo, 'text-halo-width': 1.3 },
      },
      {
        id: 'district-labels',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]],
        layout: {
          'text-field': ['upcase', ['coalesce', ['get', 'name:latin'], ['get', 'name']]],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-letter-spacing': 0.35,
          'text-max-width': 8,
        },
        paint: { 'text-color': p.label, 'text-halo-color': halo, 'text-halo-width': 1.2 },
      },
    ],
  }
}
