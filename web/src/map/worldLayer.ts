import type maplibregl from 'maplibre-gl'
import { useStore } from '../store'
import { cityFor } from '../data/mock'

/** First page: a flat, dark choropleth world with every capital marked. It fades into the street basemap as you zoom in. */
const FADE: [number, number, number, number] = [3.6, 1, 5.4, 0]
const fade = () => ['interpolate', ['linear'], ['zoom'], FADE[0], FADE[1], FADE[2], FADE[3]]
const HIT = 12 // px around a capital that still counts as a tap

export type CityRow = [name: string, country: string, lng: number, lat: number, capital: 0 | 1]

export async function addWorldLayers(map: maplibregl.Map, before: string) {
  const m = map as unknown as { addLayer: (l: unknown, b?: string) => void }
  map.addSource('world', { type: 'geojson', data: '/world/countries.json', tolerance: 0.2 })
  m.addLayer({ id: 'world-ocean', type: 'background', maxzoom: 5.6, paint: { 'background-color': '#000', 'background-opacity': fade() } }, before)
  m.addLayer(
    {
      id: 'world-fill', type: 'fill', source: 'world', maxzoom: 5.6,
      paint: { 'fill-opacity': fade(), 'fill-antialias': false, 'fill-color': ['match', ['get', 'b'], 4, '#1de9a6', 3, '#3a9fc9', 2, '#7a4fdb', 1, '#32235f', '#1c1c21'] },
    },
    before,
  )
  m.addLayer({ id: 'world-line', type: 'line', source: 'world', maxzoom: 5.6, paint: { 'line-color': '#000', 'line-width': 0.6, 'line-opacity': fade() } }, before)

  const rows: CityRow[] = await fetch('/world/cities.json').then((r) => r.json()).catch(() => [])
  map.addSource('capitals', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: rows.filter((r) => r[4]).map((r, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r[2], r[3]] }, properties: { n: r[0], c: r[1], r: i } })),
    },
  })
  m.addLayer(
    {
      id: 'capital-dot', type: 'circle', source: 'capitals', maxzoom: 7,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.8, 4, 3.5],
        'circle-color': '#fff', 'circle-stroke-color': '#000', 'circle-stroke-width': 0.8,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5.4, 1, 6.8, 0], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 5.4, 1, 6.8, 0],
      },
    },
    before,
  )
  m.addLayer(
    {
      id: 'capital-name', type: 'symbol', source: 'capitals', maxzoom: 7,
      layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9.5, 4, 12], 'text-anchor': 'left', 'text-offset': [0.55, 0], 'symbol-sort-key': ['get', 'r'], 'text-padding': 1 },
      paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.2, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 5.4, 1, 6.8, 0] },
    },
    before,
  )

  const under = (p: { x: number; y: number }) =>
    map.queryRenderedFeatures([[p.x - HIT, p.y - HIT], [p.x + HIT, p.y + HIT]], { layers: ['capital-dot', 'capital-name'] })[0]
  map.on('mousemove', (e) => {
    if (map.getZoom() < 7) map.getCanvas().style.cursor = under(e.point) ? 'pointer' : ''
  })
  map.on('click', (e) => {
    if (map.getZoom() >= 7) return
    const f = under(e.point)
    if (!f) return
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number]
    useStore.getState().openCity(cityFor(String(f.properties.n), String(f.properties.c), lng, lat))
  })
}
