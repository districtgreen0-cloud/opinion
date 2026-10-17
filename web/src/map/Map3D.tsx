import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { ScatterplotLayer, IconLayer, TextLayer, PolygonLayer } from '@deck.gl/layers'
import { useStore, type HomeFilter } from '../store'
import { buildStyle, LIGHTING, type MapLook } from '../lib/mapStyle'
import { cityData, CITIES } from '../data/mock'
import { toCell, cellCenter } from '../lib/h3'
import { avatarSrc, avatarColor } from '../lib/avatars'
import { BeaconLayer } from './BeaconLayer'
import { STATION_CENTER } from './stationArt'
import type { Route } from '../lib/route'
import { simPoints } from '../lib/sim'
import { useMajors, loadPitches, iconFor, kindOfId, majorRgb, KIND_RGB as SPORT_RGB, KIND_LABEL, gameWhen, type Major, type Pitch } from '../lib/sports'
import { kindOf, type Comment, type Friend, type Game } from '../lib/types'
import type { FootprintPlace } from '../lib/timeline'

// Keep MapLibre's worker pool alive across map teardown (React StrictMode mounts twice in dev;
// without this the second map can wait forever on a terminated worker).
maplibregl.prewarm()

import { mapHandle } from './handle'
export { mapHandle }

const IS_PHONE = window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 820
const WORLD_CENTER: [number, number] = [-40, 44] // the Atlantic: London, New York, SF and Serbia in one view
const WORLD_ZOOM = IS_PHONE ? 1.1 : 2.1

const KIND_RGB: Record<HomeFilter, [number, number, number]> = {
  all: [255, 255, 255],
  event: [0, 194, 255],
  sport: [255, 176, 32],
  topic: [178, 107, 255],
  note: [232, 232, 238],
  job: [61, 255, 168],
}

const VIBE_RGB: Record<Friend['vibe'], [number, number, number]> = {
  out: [255, 90, 31],
  chill: [140, 140, 160],
  looking: [61, 255, 168],
}

function applyLighting(map: maplibregl.Map, l: MapLook) {
  const p = LIGHTING[l]
  const halo = p.halo ?? '#000'
  const set = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop as never, v as never)
  set('bg', 'background-color', p.bg)
  set('park', 'fill-color', p.park)
  set('landuse', 'fill-color', p.park)
  set('water', 'fill-color', p.water)
  set('water-edge', 'line-color', p.roadMajor)
  set('roads-minor', 'line-color', p.road)
  set('roads-major', 'line-color', p.roadMajor)
  set('rail', 'line-color', p.roadMajor)
  set('buildings', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, p.building, 45, p.buildingTop])
  set('district-labels', 'text-color', p.label)
  set('street-names-major', 'text-color', p.street)
  set('street-names-minor', 'text-color', p.street)
  set('places', 'text-color', p.place)
  set('places-dot', 'circle-color', p.placeDot)
  set('places-dot', 'circle-stroke-color', halo)
  for (const id of ['district-labels', 'street-names-major', 'street-names-minor', 'places']) set(id, 'text-halo-color', halo)
  // flat map: sky + fog only at the tilted street-level horizon
  map.setSky({ 'sky-color': p.sky, 'horizon-color': p.horizon, 'fog-color': p.fog, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 })
  map.setLight({ anchor: 'map', color: p.light, intensity: 0.4, position: [1.4, 210, 35] })
}

export default function Map3D() {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const beaconRef = useRef<BeaconLayer | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [ready, setReady] = useState(false)
  const flownCity = useRef<string | null>(null)

  const city = useStore((s) => s.city)
  const night = useStore((s) => s.lighting)
  const ui = useStore((s) => s.ui)
  const lighting: MapLook = ui === 'light' ? 'day' : night
  const pos = useStore((s) => s.pos)
  const comments = useStore((s) => s.comments)
  const selectedCell = useStore((s) => s.selectedCell)
  const selectedEventId = useStore((s) => s.selectedEventId)
  const flyTarget = useStore((s) => s.flyTarget)
  const splashDone = useStore((s) => s.splashDone)
  const entered = useStore((s) => s.entered)
  const footprint = useStore((s) => s.footprint)
  const showFootprint = useStore((s) => s.showFootprint)
  const homeFilter = useStore((s) => s.homeFilter)
  const [zoom, setZoom] = useState(0)
  const friends = useFriendsDrift(city.id)
  const data = useMemo(() => cityData(city), [city])
  const sim = useStore((s) => s.sim)
  const simData = useMemo(() => (sim ? simPoints(city, sim) : null), [sim, city.id])
  const sportOn = homeFilter === 'sport'
  const majors = useMajors(city.id)
  const games = useStore((s) => s.games[city.id])
  const [pitches, setPitches] = useState<Record<string, Pitch[]> | null>(null)
  useEffect(() => {
    if (sportOn && !pitches) loadPitches().then(setPitches, () => {})
  }, [sportOn, pitches])
  // one tag per venue: its live game, else the next one
  const venueGames = useMemo(() => {
    const m = new Map<string, Game>()
    for (const g of games ?? []) {
      const k = `${g.lng},${g.lat}`
      const cur = m.get(k)
      if (!cur || (g.state === 'live' && cur.state !== 'live') || (cur.state === 'post' && g.state !== 'post')) m.set(k, g)
    }
    return [...m.values()]
  }, [games])

  // ── init once
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: buildStyle(useStore.getState().ui === 'light' ? 'day' : useStore.getState().lighting),
      // first visit: the whole world (flat), then the city strip flies you in; returning: straight into your city
      center: useStore.getState().entered ? city.center : WORLD_CENTER,
      zoom: useStore.getState().entered ? city.zoom : WORLD_ZOOM,
      pitch: useStore.getState().entered ? 62 : 0,
      bearing: useStore.getState().entered ? city.bearing : 0,
      maxPitch: 78,
      fadeDuration: 150,
      attributionControl: { compact: true },
      // phones: cap resolution at 2× and skip MSAA — a 3× canvas with three render systems can exceed iOS GPU memory
      pixelRatio: Math.min(window.devicePixelRatio || 1, IS_PHONE ? 2 : 3),
      canvasContextAttributes: { antialias: !IS_PHONE },
    })
    mapRef.current = map
    mapHandle.current = map
    ;(window as unknown as { __map: maplibregl.Map }).__map = map // debug handle
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
    overlayRef.current = overlay
    const beacons = new BeaconLayer()
    beaconRef.current = beacons

    // Flat (mercator) everywhere: deck.gl draws at every zoom, no projection swaps, no atmosphere pass.
    const worldClass = () => map.getContainer().classList.toggle('world', map.getZoom() < 10.5)
    map.on('zoom', worldClass)
    worldClass()
    map.on('load', () => {
      map.addControl(overlay)
      // navigation route (MapLibre layers so it draws at every zoom)
      map.addSource('nav-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'nav-casing', type: 'line', source: 'nav-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-opacity': 0.45, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 18, 16] } })
      map.addLayer({ id: 'nav-line', type: 'line', source: 'nav-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#14f195', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 18, 9] } })
      useStore.getState().setMapReady()
      map.addLayer(beacons)
      const s = useStore.getState()
      const d = cityData(s.city)
      beacons.setScene(s.city.center, d.events, s.city.id)
      if (s.pos) beacons.setUser([s.pos.lng, s.pos.lat])
      setReady(true)
      setZoom(map.getZoom())
    })
    map.on('zoomend', () => setZoom(map.getZoom()))

    map.on('click', (e) => {
      const s = useStore.getState()
      const { lng, lat } = e.lngLat
      if (map.getZoom() < 12.2) return // from space / overview: pick a city via the beacons / picker
      if (s.teleportArmed) {
        s.setPos({ lat, lng, source: 'teleport' })
        s.armTeleport(false)
        s.selectCell(toCell(lat, lng))
        s.toast('Teleported · this hex is unlocked', 'ember')
        return
      }
      const sportPick = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 8, layerIds: ['sport-icons', 'sport-pitches', 'sport-venues', 'game-tags'] })?.object as Major | Pitch | Game | undefined
      const picked = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 6, layerIds: ['friends'] })
      if (picked?.object) {
        const f = picked.object as Friend
        s.openProfile({ handle: f.handle, avatar: f.avatar, x: e.point.x, y: e.point.y + 14 })
        return
      }
      s.setPickPoint([lng, lat])
      const cell = toCell(lat, lng)
      const ev = cityData(s.city).events.find((x) => toCell(x.lat, x.lng) === cell)
      s.selectEvent(ev?.id ?? null)
      s.selectCell(cell)
      // an OSM place under the cursor names the hex
      const box: [[number, number], [number, number]] = [
        [e.point.x - 10, e.point.y - 10],
        [e.point.x + 10, e.point.y + 10],
      ]
      const dist = (f: maplibregl.MapGeoJSONFeature) => {
        if (f.geometry.type !== 'Point') return Infinity
        const q = map.project(f.geometry.coordinates as [number, number])
        return Math.hypot(q.x - e.point.x, q.y - e.point.y)
      }
      // nearest dot wins; fall back to a label under the cursor
      const place =
        map
          .queryRenderedFeatures(box, { layers: ['places-dot'] })
          .filter((f) => f.properties?.name)
          .sort((a, b) => dist(a) - dist(b))[0] ?? map.queryRenderedFeatures(box, { layers: ['places'] })[0]
      if (place) s.selectPlace({ name: String(place.properties['name:latin'] ?? place.properties.name), kind: String(place.properties.subclass ?? place.properties.class ?? '') })
      if (sportPick) {
        if (Array.isArray(sportPick)) s.selectPlace({ name: KIND_LABEL[kindOfId(sportPick[2])], kind: 'sport' })
        else if ('home' in sportPick) {
          s.selectGame(sportPick.id)
          s.selectPlace({ name: sportPick.venue, kind: `${sportPick.league} · ${sportPick.home} v ${sportPick.away}` })
        } else s.selectPlace({ name: sportPick.n || KIND_LABEL[kindOfId(sportPick.k)], kind: KIND_LABEL[kindOfId(sportPick.k)] + (sportPick.c ? ` · ${sportPick.c.toLocaleString()} seats` : '') })
      }
      if (s.tab !== 'explore') s.setTab('explore')
    })

    return () => {
      markersRef.current.forEach((m) => m.remove())
      map.remove()
      mapRef.current = null
      mapHandle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── cinematic arrival after splash, and on city change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !splashDone || !ready) return
    beaconRef.current?.setScene(city.center, data.events, city.id)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!entered) {
      // back to space (World view)
      if (flownCity.current !== null) map.flyTo({ center: WORLD_CENTER, zoom: WORLD_ZOOM, pitch: 0, bearing: 0, duration: still ? 0 : 3800, curve: 1.4, essential: true })
      flownCity.current = null
      return
    }
    // live feeds swap in a new `city` object: rebuild beacons, but only fly the camera on a real city change
    if (flownCity.current === city.id) return
    const fromSpace = map.getZoom() < 8
    flownCity.current = city.id
    map.stop()
    // cinematic entry: one arc from the world map down into the tilted streets
    map.flyTo({
      center: city.center,
      zoom: city.zoom,
      pitch: 62,
      bearing: city.bearing,
      duration: still ? 0 : fromSpace ? 5200 : 4200,
      curve: fromSpace ? 1.7 : 1.6,
      speed: fromSpace ? 0.7 : 1.2,
      essential: true,
    })
  }, [city, splashDone, data, ready, entered])

  // ── navigation: route line (remaining part only) + destination pin
  const nav = useStore((s) => s.nav)
  const navPin = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('nav-route') as maplibregl.GeoJSONSource | undefined
    const r = nav?.route
    let coords = r?.coords ?? []
    if (r && pos) {
      const here: [number, number] = [pos.lng, pos.lat]
      // drop the part already travelled (nearest vertex ahead of us)
      let best = 0
      let bd = Infinity
      for (let i = 0; i < coords.length; i++) {
        const d = (coords[i]![0] - here[0]) ** 2 + (coords[i]![1] - here[1]) ** 2
        if (d < bd) {
          bd = d
          best = i
        }
      }
      coords = [here, ...coords.slice(best + 1)]
    }
    src?.setData({ type: 'FeatureCollection', features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] })
    if (map.getLayer('nav-line')) map.setPaintProperty('nav-line', 'line-color', nav?.mode === 'car' ? '#00c2ff' : nav?.mode === 'bike' ? '#ffb020' : '#14f195')
    if (!nav) {
      navPin.current?.remove()
      navPin.current = null
      return
    }
    if (!navPin.current) {
      const el = document.createElement('div')
      el.className = 'nav-pin'
      el.innerHTML = '<i></i>'
      navPin.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(nav.dest).addTo(map)
    } else navPin.current.setLngLat(nav.dest)
  }, [nav, pos, ready])
  // fit the whole route once when it arrives (the follow camera takes over on the first GPS move)
  const fitted = useRef<Route | null>(null)
  useEffect(() => {
    const map = mapRef.current
    const r = nav?.route
    if (!map || !r || fitted.current === r || nav?.simulate) return
    fitted.current = r
    const b = r.coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(r.coords[0]!, r.coords[0]!))
    map.fitBounds(b, { padding: { top: 150, bottom: 230, left: 50, right: 50 }, pitch: 45, duration: 1400, maxZoom: 16.5 })
  }, [nav?.route, nav?.simulate])

  // ── World view: the city strip pans the map to the city on show
  const peek = useStore((s) => s.peek)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || entered || !peek) return
    map.easeTo({ center: peek.center, zoom: Math.max(map.getZoom(), WORLD_ZOOM + 0.5), duration: 1400, easing: (t) => 1 - Math.pow(1 - t, 3) })
  }, [peek, ready, entered])

  // ── glowing city beacons on the world map (hidden at street level by the .world class)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const ms = CITIES.map((c, i) => {
      const node = document.createElement('button')
      node.className = 'globe-city'
      node.style.setProperty('--d', `${i * 0.37}s`)
      node.innerHTML = `<i></i><span>${c.name}</span>`
      node.addEventListener('click', (e) => {
        e.stopPropagation()
        useStore.getState().enterCity(c.id)
      })
      return new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat(c.center).addTo(map)
    })
    return () => ms.forEach((m) => m.remove())
  }, [ready])

  useEffect(() => {
    const map = mapRef.current
    if (map && ready) applyLighting(map, lighting)
  }, [lighting, ready])

  useEffect(() => {
    beaconRef.current?.setUser(pos ? [pos.lng, pos.lat] : null)
  }, [pos])
  useEffect(() => {
    if (ready) beaconRef.current?.setTheme(ui)
  }, [ui, ready])
  const heading = useStore((s) => s.heading)
  useEffect(() => {
    beaconRef.current?.setHeading(heading)
  }, [heading])
  useEffect(() => {
    beaconRef.current?.setSelected(selectedEventId)
  }, [selectedEventId])

  useEffect(() => {
    if (!flyTarget || !mapRef.current) return
    mapRef.current.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: flyTarget.zoom ?? 16.4, pitch: 62, duration: 1800, essential: true })
  }, [flyTarget])

  // ── deck.gl layers
  const myCell = pos ? toCell(pos.lat, pos.lng) : null
  const commentCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of comments) m.set(c.cell, (m.get(c.cell) ?? 0) + 1)
    return m
  }, [comments])

  const jobCells = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of comments) if (kindOf(c) === 'job' && ['open', 'funded'].includes(c.jobStatus ?? 'open')) m.set(c.cell, (m.get(c.cell) ?? 0) + 1)
    return [...m].map(([cell, n]) => ({ p: cellCenter(cell), n }))
  }, [comments])

  const kindCells = useMemo(() => {
    if (homeFilter === 'all') return []
    // events: outline every venue hex
    if (homeFilter === 'event') return data.events.map((e) => ({ cell: toCell(e.lat, e.lng), n: 3 }))
    if (homeFilter === 'sport') return venueGames.map((g) => ({ cell: toCell(g.lat, g.lng), n: g.state === 'live' ? 5 : 3 }))
    const m = new Map<string, number>()
    for (const c of comments) {
      if (kindOf(c) !== homeFilter) continue
      if (homeFilter === 'job' && !['open', 'funded'].includes(c.jobStatus ?? 'open')) continue
      m.set(c.cell, (m.get(c.cell) ?? 0) + 1)
    }
    return [...m].map(([cell, n]) => ({ cell, n }))
  }, [comments, homeFilter, data, venueGames])

  // you're standing on a live hex (activity or posts) → compass dot turns purple
  const onHex = !!myCell && (data.hexActivity.has(myCell) || commentCounts.has(myCell))
  useEffect(() => {
    beaconRef.current?.setOnHex(onHex)
  }, [onHex])

  const footprintHexes = useMemo(() => {
    if (!footprint) return []
    const entries = Object.entries(footprint.cells)
    const max = Math.log1p(Math.max(...entries.map(([, n]) => n), 1))
    return entries.map(([cell, n]) => ({ cell, t: Math.log1p(n) / max }))
  }, [footprint])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const fp = showFootprint && footprint
    const hexes = [...new Set([...data.hexActivity.keys(), ...commentCounts.keys()])].map((cell) => ({
      cell,
      a: Math.min(1, (data.hexActivity.get(cell) ?? 0) + (commentCounts.get(cell) ?? 0) * 0.08),
    }))
    const highlight = [selectedCell && { cell: selectedCell, kind: 'sel' }, myCell && { cell: myCell, kind: 'me' }].filter(Boolean) as {
      cell: string
      kind: 'sel' | 'me'
    }[]

    overlay.setProps({
      layers: zoom < 9 ? [] : [
        // 🟢 simulated users (10k / 1M), packed binary data → GPU
        simData &&
          new ScatterplotLayer({
            id: 'sim-users',
            data: { length: simData.drawn, attributes: { getPosition: { value: simData.positions, size: 2 } } },
            radiusUnits: 'pixels',
            getRadius: sim === 1_000_000 ? (zoom >= 15 ? 1.6 : 1.1) : zoom >= 15 ? 3 : 2.1,
            radiusMinPixels: 0.8,
            getFillColor: ui === 'light' ? [8, 150, 80, sim === 1_000_000 ? (zoom >= 13 ? 140 : 70) : 210] : [20, 241, 149, sim === 1_000_000 ? (zoom >= 13 ? 120 : 55) : 200],
            updateTriggers: { getFillColor: [ui, sim, zoom >= 13], getRadius: [sim, zoom >= 15] },
            parameters: { depthWriteEnabled: false, depthCompare: 'always' },
          }),
        !simData &&
        new ScatterplotLayer({
          id: 'people',
          data: IS_PHONE ? data.people.slice(0, 600) : data.people,
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 2,
          radiusUnits: 'meters',
          radiusMinPixels: 1,
          radiusMaxPixels: 2.4,
          getFillColor: (d) => (d.c ? [178, 107, 255, 150] : [120, 120, 135, 90]),
          parameters: { depthWriteEnabled: false },
        }),
        // your own Google Timeline, imported on-device: where you've actually been
        fp &&
          new H3HexagonLayer<{ cell: string; t: number }>({
            id: 'footprint',
            data: footprintHexes,
            getHexagon: (d) => d.cell,
            extruded: false,
            filled: true,
            stroked: true,
            getFillColor: (d) => [255, Math.round(90 + 60 * d.t), 31, Math.round(14 + d.t * 70)],
            getLineColor: (d) => [255, 120, 60, Math.round(40 + d.t * 140)],
            lineWidthMinPixels: 1,
            parameters: { depthWriteEnabled: false },
          }),
        fp &&
          new ScatterplotLayer<FootprintPlace>({
            id: 'footprint-places',
            data: footprint.places.slice(0, 120),
            getPosition: (d) => [d.lng, d.lat],
            getRadius: (d) => 3 + Math.min(6, Math.log2(d.visits + 1)),
            radiusUnits: 'pixels',
            stroked: true,
            getFillColor: [255, 90, 31, 200],
            getLineColor: [0, 0, 0, 255],
            lineWidthMinPixels: 1,
            parameters: { depthCompare: 'always' },
          }),
        fp &&
          new TextLayer<FootprintPlace>({
            id: 'footprint-labels',
            data: footprint.places.filter((p) => p.name).slice(0, 40),
            getPosition: (d) => [d.lng, d.lat],
            getText: (d) => `${d.name} · ${d.visits}×`,
            characterSet: 'auto',
            fontFamily: 'Inter, system-ui, sans-serif',
            getSize: 11,
            getColor: [255, 190, 160, 230],
            getPixelOffset: [0, -14],
            outlineWidth: 2,
            outlineColor: [0, 0, 0, 255],
            fontSettings: { sdf: true },
            parameters: { depthCompare: 'always' },
          }),
        new H3HexagonLayer({
          id: 'hexes',
          data: hexes,
          getHexagon: (d) => d.cell,
          extruded: false,
          filled: true,
          stroked: true,
          // violet → hot pink with activity (375go), kept faint so the city stays black
          getFillColor: (d) => [Math.round(150 + 105 * d.a), Math.round(90 - 40 * d.a), Math.round(255 - 90 * d.a), Math.round((6 + d.a * 46) * (ui === 'light' ? 0.4 : 1))],
          getLineColor: (d) => [178, 107, 255, Math.round((18 + d.a * 90) * (ui === 'light' ? 0.7 : 1))],
          lineWidthMinPixels: 1,
          getLineWidth: 1,
          updateTriggers: { getFillColor: [commentCounts.size, comments.length, ui], getLineColor: [comments.length, ui] },
          parameters: { depthWriteEnabled: false },
        }),
        // home tab filter: outline every hex that holds posts of the chosen kind
        new H3HexagonLayer<{ cell: string; n: number }>({
          id: 'kind-hexes',
          data: kindCells,
          getHexagon: (d) => d.cell,
          extruded: false,
          filled: true,
          stroked: true,
          getFillColor: (d) => [...KIND_RGB[homeFilter], Math.min(90, 26 + d.n * 16)] as [number, number, number, number],
          getLineColor: [...KIND_RGB[homeFilter], 230] as [number, number, number, number],
          lineWidthMinPixels: 1.5,
          updateTriggers: { getFillColor: [homeFilter], getLineColor: [homeFilter] },
          parameters: { depthWriteEnabled: false },
        }),
        new H3HexagonLayer({
          id: 'hex-highlight',
          data: highlight,
          getHexagon: (d) => d.cell,
          extruded: false,
          filled: true,
          stroked: true,
          getFillColor: (d) => (d.kind === 'me' ? [255, 90, 31, 45] : [255, 255, 255, 18]),
          getLineColor: (d) => (d.kind === 'me' ? [255, 90, 31, 255] : [255, 255, 255, 200]),
          lineWidthMinPixels: 2,
          parameters: { depthWriteEnabled: false },
        }),
        // jobs: a mint $ over every hex with an open/funded USDC offer
        new TextLayer<{ p: [number, number]; n: number }>({
          id: 'job-markers',
          data: homeFilter === 'all' || homeFilter === 'job' ? jobCells : [],
          getPosition: (d) => d.p,
          getText: (d) => (d.n > 1 ? `$×${d.n}` : '$'),
          characterSet: 'auto',
          fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif',
          fontWeight: 700,
          getSize: 15,
          getColor: [61, 255, 168, 240],
          outlineWidth: 3,
          outlineColor: [0, 0, 0, 255],
          fontSettings: { sdf: true },
          getPixelOffset: [14, -10],
          billboard: true,
          parameters: { depthCompare: 'always' },
        }),
        new TextLayer({
          id: 'sparks',
          data: [...data.poiCells].map((c) => ({ p: cellCenter(c) })),
          getPosition: (d) => d.p,
          getText: () => '✦',
          characterSet: ['✦'],
          fontFamily: 'Inter, system-ui, sans-serif',
          getSize: 18,
          getColor: ui === 'light' ? [120, 60, 220, 230] : [255, 255, 255, 230],
          updateTriggers: { getColor: ui },
          billboard: true,
          getPixelOffset: [0, -2],
        }),
        // 🏟 sports: glass stadium/arena footprints (all tabs: outline · Sports tab: lit, extruded)
        new PolygonLayer<Major>({
          id: 'sport-venues',
          data: sportOn ? majors.filter((m) => m.r) : majors.filter((m) => m.r && m.k <= 1),
          getPolygon: (d) => d.r!,
          extruded: sportOn,
          wireframe: sportOn,
          getElevation: (d) => (d.k === 0 ? 48 : 32),
          filled: true,
          stroked: !sportOn,
          material: false,
          pickable: sportOn,
          getFillColor: (d) => [...majorRgb(d), sportOn ? 52 : 14] as [number, number, number, number],
          getLineColor: (d) => [...majorRgb(d), sportOn ? 210 : 120] as [number, number, number, number],
          lineWidthMinPixels: 1,
          updateTriggers: { getFillColor: sportOn, getLineColor: sportOn },
          parameters: { depthWriteEnabled: false },
        }),
        sportOn &&
          pitches &&
          (zoom >= 15.2
            ? new IconLayer<Pitch>({
                id: 'sport-pitches',
                data: pitches[city.id] ?? [],
                pickable: true,
                getPosition: (d) => [d[0], d[1]],
                getIcon: (d) => iconFor(kindOfId(d[2])),
                getSize: zoom >= 16.5 ? 22 : 16,
                sizeUnits: 'pixels',
                billboard: true,
                updateTriggers: { getSize: zoom >= 16.5 },
                parameters: { depthCompare: 'always' },
              })
            : zoom >= 12.8 &&
              new ScatterplotLayer<Pitch>({
                id: 'sport-pitches',
                data: pitches[city.id] ?? [],
                pickable: true,
                getPosition: (d) => [d[0], d[1]],
                radiusUnits: 'pixels',
                getRadius: 2.4,
                getFillColor: (d) => [...SPORT_RGB[kindOfId(d[2])], 210] as [number, number, number, number],
                parameters: { depthCompare: 'always', depthWriteEnabled: false },
              })),
        sportOn &&
          new IconLayer<Major>({
            id: 'sport-icons',
            data: majors.filter((m) => m.k <= 1 || (m.n && zoom >= 14.6)),
            pickable: true,
            getPosition: (d) => [d.p[0], d.p[1], d.k === 0 ? 52 : 36],
            getIcon: (d) => iconFor(kindOfId(d.k)),
            getSize: (d) => (d.k <= 1 ? 30 : 20),
            sizeUnits: 'pixels',
            billboard: true,
            parameters: { depthCompare: 'always' },
          }),
        new TextLayer<Major>({
          id: 'sport-labels',
          data: majors.filter((m) => m.n && (sportOn ? (m.k <= 1 && ((m.c ?? 0) >= 5000 || zoom >= 13.6)) || zoom >= 15.4 : m.k <= 1 && zoom >= 12.6 && ((m.c ?? 0) >= 10000 || zoom >= 15))),
          getPosition: (d) => [d.p[0], d.p[1], d.k === 0 ? 52 : 36],
          getText: (d) => d.n,
          characterSet: 'auto',
          fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif',
          fontWeight: 600,
          getSize: (d) => (d.k <= 1 ? 12 : 10.5),
          getColor: (d) => [...majorRgb(d), sportOn ? 245 : 170] as [number, number, number, number],
          getPixelOffset: [0, sportOn ? 22 : 0],
          outlineWidth: 3,
          outlineColor: [0, 0, 0, 255],
          fontSettings: { sdf: true },
          billboard: true,
          updateTriggers: { getColor: sportOn, getPixelOffset: sportOn },
          parameters: { depthCompare: 'always' },
        }),
        // fixtures: a ring + tag on every stadium with a game (live = red, everywhere; upcoming = Sports tab)
        new ScatterplotLayer<Game>({
          id: 'game-rings',
          data: sportOn ? venueGames : venueGames.filter((g) => g.state === 'live'),
          getPosition: (d) => [d.lng, d.lat],
          radiusUnits: 'pixels',
          getRadius: 24,
          stroked: true,
          getFillColor: (d) => (d.state === 'live' ? [255, 59, 48, 40] : [255, 176, 32, 26]),
          getLineColor: (d) => (d.state === 'live' ? [255, 59, 48, 255] : [255, 176, 32, 220]),
          lineWidthMinPixels: 2,
          billboard: true,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }),
        new TextLayer<Game>({
          id: 'game-tags',
          data: sportOn ? venueGames : venueGames.filter((g) => g.state === 'live'),
          pickable: true,
          getPosition: (d) => [d.lng, d.lat, 52],
          getText: (d) => `${gameWhen(d)} · ${d.home}${d.score ? ` ${d.score[0]}–${d.score[1]} ` : ' v '}${d.away}`,
          characterSet: 'auto',
          fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif',
          fontWeight: 700,
          getSize: 12,
          getColor: (d) => (d.state === 'live' ? [255, 120, 110, 255] : [255, 210, 130, 255]),
          getPixelOffset: [0, -40],
          background: true,
          getBackgroundColor: [0, 0, 0, 200],
          backgroundPadding: [6, 3],
          getBorderColor: (d) => (d.state === 'live' ? [255, 59, 48, 200] : [255, 176, 32, 160]),
          getBorderWidth: 1,
          fontSettings: { sdf: true },
          billboard: true,
          parameters: { depthCompare: 'always' },
        }),
        new ScatterplotLayer<Friend>({
          id: 'friend-halo',
          data: friends.filter((f) => f.online),
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 15,
          radiusMinPixels: 15,
          radiusMaxPixels: 15,
          stroked: true,
          filled: true,
          getFillColor: (d) => [...VIBE_RGB[d.vibe], 40],
          getLineColor: (d) => [...VIBE_RGB[d.vibe], 220],
          lineWidthMinPixels: 1.5,
          transitions: { getPosition: 1800 },
          billboard: true,
          parameters: { depthCompare: 'always' },
        }),
        new IconLayer<Friend>({
          id: 'friends',
          data: friends.filter((f) => f.online),
          pickable: true,
          getPosition: (d) => [d.lng, d.lat],
          getIcon: (d) => ({ url: avatarSrc(d.avatar, d.handle), width: 64, height: 64, id: d.id }),
          getSize: 22,
          sizeUnits: 'pixels',
          loadOptions: { imagebitmap: { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'high' } },
          transitions: { getPosition: 1800 },
          billboard: true,
          parameters: { depthCompare: 'always' },
        }),
      ],
    })
  }, [data, friends, comments, commentCounts, selectedCell, myCell, ready, footprint, footprintHexes, showFootprint, jobCells, kindCells, homeFilter, zoom >= 16.5, sportOn, majors, pitches, venueGames, zoom >= 12.6, zoom >= 12.8, zoom >= 13.6, zoom >= 14.6, zoom >= 15, zoom >= 15.2, zoom >= 15.4, zoom < 9, city.id, ui, simData, zoom >= 15, zoom >= 13])

  // ── London landmark labels (Breakpoint-style slabs) — click → fly + open the event
  const landmarkMarkers = useRef<maplibregl.Marker[]>([])
  useEffect(() => {
    const map = mapRef.current
    landmarkMarkers.current.forEach((m) => m.remove())
    landmarkMarkers.current = []
    if (!map || !ready) return
    if (city.id === 'bgd') {
      const node = document.createElement('div')
      node.className = 'bp-label gold'
      node.innerHTML = `<div><span class="tag">1884</span><span class="t">Build Station</span></div><div class="rule"></div><div class="s">Old Railway Station · Savski trg · Beograd ↗</div>`
      node.addEventListener('click', (e) => {
        e.stopPropagation()
        useStore.getState().flyTo(STATION_CENTER[0], STATION_CENTER[1], 17)
      })
      landmarkMarkers.current = [new maplibregl.Marker({ element: node, anchor: 'bottom', offset: [0, -150] }).setLngLat(STATION_CENTER).addTo(map)]
      return
    }
    if (city.id !== 'ldn') return
    const LABELS = [
      { ev: 'ldn-bp26', at: [-0.2096, 51.4963] as [number, number], tag: 'BP26', cls: 'p', t: 'Breakpoint 2026', s: 'Olympia London · 15–17 Nov' },
      { ev: 'ldn-hh', at: [-0.1174, 51.5109] as [number, number], tag: 'HH', cls: '', t: 'Hacker House London', s: 'Somerset House · 1–12 Nov · Demo Day 12 Nov' },
    ]
    landmarkMarkers.current = LABELS.map((l) => {
      const node = document.createElement('div')
      node.className = 'bp-label'
      node.innerHTML = `<div><span class="tag ${l.cls}">${l.tag}</span><span class="t">${l.t}</span></div><div class="rule"></div><div class="s">${l.s} ↗</div>`
      node.addEventListener('click', (e) => {
        e.stopPropagation()
        const s = useStore.getState()
        s.selectEvent(l.ev)
        s.flyTo(l.at[0], l.at[1], 16.6)
        s.setTab('events')
      })
      return new maplibregl.Marker({ element: node, anchor: 'bottom', offset: [0, -40] }).setLngLat(l.at).addTo(map)
    })
  }, [city, ready])

  // ── floating comment bubbles (latest per hex, fade with age)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    const seen = new Set<string>()
    const latest: Comment[] = []
    const filter = homeFilter
    if (filter === 'event' || filter === 'sport') {
      markersRef.current = []
      return
    }
    for (const c of comments) {
      if (kindOf(c) === 'reply' || seen.has(c.cell)) continue
      if (filter !== 'all' && kindOf(c) !== filter) continue
      if (kindOf(c) === 'job' && !['open', 'funded'].includes(c.jobStatus ?? 'open')) continue
      seen.add(c.cell)
      latest.push(c)
      if (latest.length >= 7) break
    }
    markersRef.current = latest.map((c) => {
      const node = document.createElement('div')
      node.className = 'bubble'
      const age = (Date.now() - c.createdAt) / 60000
      node.style.opacity = String(Math.max(0.25, 1 - age / 90))
      node.style.borderColor = avatarColor(c.avatar) + '66'
      node.textContent = kindOf(c) === 'job' ? `💼 ${c.priceUsdc} USDC · ${c.title}` : kindOf(c) === 'topic' ? `💬 ${c.title}` : c.text
      if (kindOf(c) === 'job') node.style.borderColor = 'rgba(61,255,168,.45)'
      node.title = `${c.handle} · tap for profile`
      node.style.cursor = 'pointer'
      node.style.pointerEvents = 'auto'
      node.addEventListener('click', (e) => {
        e.stopPropagation()
        const r = node.getBoundingClientRect()
        useStore.getState().openProfile({ handle: c.handle, avatar: c.avatar, x: r.left + r.width / 2, y: r.bottom })
      })
      return new maplibregl.Marker({ element: node, anchor: 'bottom-left', offset: [6, -6] }).setLngLat(cellCenter(c.cell)).addTo(map)
    })
  }, [comments, homeFilter])

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} aria-label="3D city map" />
}

/** Friends gently drift; positions are tweened by deck.gl transitions. */
function useFriendsDrift(cityId: string): Friend[] {
  const city = useStore((s) => s.city)
  const ghost = useStore((s) => s.me.ghost)
  const base = useMemo(() => cityData(city).friends, [city])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setTick((t) => t + 1), 2200)
    return () => clearInterval(id)
  }, [])
  return useMemo(() => {
    void tick
    void cityId
    void ghost
    return base.map((f) => ({
      ...f,
      lat: f.lat + (Math.random() - 0.5) * 0.00035,
      lng: f.lng + (Math.random() - 0.5) * 0.00045,
    }))
  }, [base, tick, cityId, ghost])
}
