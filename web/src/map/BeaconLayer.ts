import * as THREE from 'three'
import { buildCompass, type CompassHandle } from './compassArt'
import { MercatorCoordinate, type CustomLayerInterface, type Map as MLMap } from 'maplibre-gl'
import type { VEvent } from '../lib/types'
import { AVATARS, avatarSrc } from '../lib/avatars'
import { buildLandmarks, type LandmarkHandle } from './landmarks'
import { buildStation, type StationHandle } from './stationArt'
import { LANDMARK_EVENT } from '../data/mock'

/**
 * The Radiate signature, rendered with three.js inside MapLibre's GL context:
 *  - a light column per venue (violet + breathing = live, mint + still = upcoming)
 *  - a floodlight cone whose brightness is crowd density
 *  - a ring of avatars orbiting live venues, tied to the column with hairlines
 *  - a light ground compass + red dot for "you" (compassArt.ts)
 * Scene units are metres: x = east, y = up, z = south.
 */

const VIOLET = new THREE.Color('#b26bff')
const MINT = new THREE.Color('#3dffa8')

const beamVert = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const beamFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uIntensity; uniform float uPulse;
  varying vec2 vUv;
  void main(){
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.4);
    float edge = pow(abs(sin(vUv.x * 3.14159)), 0.5);
    float scan = 0.75 + 0.25 * sin(h * 36.0 - uTime * 3.0) * uPulse;
    float a = fade * edge * scan * uIntensity * 1.6;
    vec3 c = mix(uColor, vec3(1.0), smoothstep(0.55, 1.0, edge) * fade * 0.55);
    gl_FragColor = vec4(c * a, a);
  }
`
const coneFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
  varying vec2 vUv;
  void main(){
    float a = pow(vUv.y, 1.5) * 0.16 * uIntensity * (0.85 + 0.15 * sin(uTime * 1.7));
    gl_FragColor = vec4(uColor * a, a);
  }
`
const ringFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uLive;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float t = fract(uTime * 0.45);
    float wave = uLive * smoothstep(0.06, 0.0, abs(r - t)) * (1.0 - t);
    float core = smoothstep(0.22, 0.0, r) * 0.55;
    float rim = smoothstep(0.03, 0.0, abs(r - 0.35)) * 0.6;
    float a = (wave + core + rim) * step(r, 1.0);
    gl_FragColor = vec4(uColor * a, a);
  }
`
const orbitVert = /* glsl */ `
  attribute float aIdx; uniform float uSize; varying float vIdx;
  void main(){ vIdx = aIdx; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize; }
`
const orbitFrag = /* glsl */ `
  uniform sampler2D uAtlas; uniform vec3 uRing; varying float vIdx;
  void main(){
    vec2 p = gl_PointCoord - 0.5; float r = length(p);
    if (r > 0.5) discard;
    vec2 uv = vec2((vIdx + gl_PointCoord.x) / 8.0, 1.0 - gl_PointCoord.y);
    vec4 tex = texture2D(uAtlas, uv);
    float ring = smoothstep(0.40, 0.44, r);
    vec3 c = mix(tex.rgb, uRing, ring);
    gl_FragColor = vec4(c, 1.0);
  }
`

type Beacon = {
  ev: VEvent
  group: THREE.Group
  beam: THREE.ShaderMaterial
  cone: THREE.ShaderMaterial
  ring: THREE.ShaderMaterial
  orbit?: { pts: THREE.Points; lines: THREE.LineSegments; n: number; radius: number; phase: number[]; height: number[] }
}

export class BeaconLayer implements CustomLayerInterface {
  id = 'opinion-beacons'
  type = 'custom' as const
  renderingMode = '3d' as const

  private map!: MLMap
  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private origin!: MercatorCoordinate
  private scale = 1
  private originMatrix = new THREE.Matrix4()
  private beacons: Beacon[] = []
  private compass: CompassHandle | null = null
  private heading: number | null = null
  private atlas: THREE.CanvasTexture
  private selected: string | null = null
  private clock = new THREE.Timer()
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private pending: { center: [number, number]; events: VEvent[]; cityId: string } | null = null
  private landmarks: LandmarkHandle | null = null
  private station: StationHandle | null = null
  private userPos: [number, number] | null = null
  private dpr = Math.min(window.devicePixelRatio || 1, 2)

  constructor() {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 64
    this.atlas = new THREE.CanvasTexture(canvas)
    this.atlas.colorSpace = THREE.SRGBColorSpace
    const ctx = canvas.getContext('2d')!
    AVATARS.forEach((id, i) => {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, i * 64, 0, 64, 64)
        this.atlas.needsUpdate = true
      }
      img.src = avatarSrc(id)
    })
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false
    if (this.pending) this.setScene(this.pending.center, this.pending.events, this.pending.cityId)
  }

  onRemove() {
    this.clear()
    this.atlas.dispose()
    this.renderer?.dispose()
  }

  /** Anchor the scene at the city center and rebuild every venue beacon. */
  /** cityId picks the city's 3D art: London → glass event landmarks, Belgrade → the gold Old Railway Station. */
  setScene(center: [number, number], events: VEvent[], cityId = '') {
    const landmarks = cityId === 'ldn'
    this.pending = { center, events, cityId }
    if (!this.renderer) return
    this.clear()
    this.origin = MercatorCoordinate.fromLngLat(center, 0)
    this.scale = this.origin.meterInMercatorCoordinateUnits()
    this.originMatrix = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z ?? 0)
      .scale(new THREE.Vector3(this.scale, -this.scale, this.scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    // venues with a real 3D landmark get the glass building instead of a generic beacon
    for (const ev of events) if (!(landmarks && LANDMARK_EVENT[ev.id])) this.beacons.push(this.makeBeacon(ev))
    if (landmarks) {
      this.landmarks = buildLandmarks((ll) => this.toLocal(ll), this.dpr)
      this.scene.add(this.landmarks.group)
    }
    if (cityId === 'bgd') {
      this.station = buildStation((ll) => this.toLocal(ll), this.dpr)
      this.scene.add(this.station.group)
    }
    if (this.userPos) this.setUser(this.userPos)
    this.applyTheme()
    this.map.triggerRepaint()
  }

  /** Light theme: additive glow vanishes on a white map, so glass + beams switch to normal blending (and back). */
  private light = false
  setTheme(ui: 'dark' | 'light') {
    this.light = ui === 'light'
    this.compass?.setLight(this.light)
    this.applyTheme()
    this.map?.triggerRepaint()
  }
  private applyTheme() {
    this.scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      for (const m of mats ? (Array.isArray(mats) ? mats : [mats]) : []) {
        if (m.userData.glow === undefined) m.userData.glow = m.blending === THREE.AdditiveBlending
        if (!m.userData.glow) continue
        const want = this.light ? THREE.NormalBlending : THREE.AdditiveBlending
        if (m.blending !== want) {
          m.blending = want
          m.needsUpdate = true
        }
      }
    })
  }

  /** device heading in degrees clockwise from north (null = unknown) */
  /** red dot turns purple while you stand on an active hex */
  private onHex = false
  setOnHex(on: boolean) {
    this.onHex = on
    this.compass?.setActive(on)
    this.map?.triggerRepaint()
  }

  setHeading(deg: number | null) {
    this.heading = deg
    this.compass?.setHeading(deg)
    this.map?.triggerRepaint()
  }

  setSelected(id: string | null) {
    this.selected = id
    this.landmarks?.focus(id ? (LANDMARK_EVENT[id] ?? null) : null)
    this.station?.focus(id === 'bgd-build-station')
    this.map?.triggerRepaint()
  }

  setUser(lngLat: [number, number] | null) {
    this.userPos = lngLat
    if (!this.renderer || !this.origin) return
    if (!lngLat) {
      if (this.compass) {
        this.scene.remove(this.compass.group)
        this.compass.dispose()
        this.compass = null
      }
      return
    }
    if (!this.compass) {
      this.compass = buildCompass()
      this.compass.setLight(this.light)
      this.compass.setHeading(this.heading)
      this.compass.setActive(this.onHex)
      this.scene.add(this.compass.group)
    }
    const [x, z] = this.toLocal(lngLat)
    this.compass.group.position.set(x, 1.2, z)
    this.map.triggerRepaint()
  }

  private toLocal([lng, lat]: [number, number]): [number, number] {
    const m = MercatorCoordinate.fromLngLat({ lng, lat }, 0)
    return [(m.x - this.origin.x) / this.scale, (m.y - this.origin.y) / this.scale]
  }

  private makeBeacon(ev: VEvent): Beacon {
    const live = ev.status === 'live'
    const color = live ? VIOLET : MINT
    const density = Math.min(1, ev.attendees / 450)
    const group = new THREE.Group()
    const [x, z] = this.toLocal([ev.lng, ev.lat])
    group.position.set(x, 0, z)

    const height = live ? 420 : 240
    const beam = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: { uColor: { value: color }, uTime: { value: 0 }, uIntensity: { value: live ? 1 : 0.7 }, uPulse: { value: live ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(live ? 7 : 5, live ? 7 : 5, height, 32, 1, true), beam)
    beamMesh.position.y = height / 2
    const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, height * 0.85, 12, 1, true), beam)
    coreMesh.position.y = (height * 0.85) / 2
    const haloMesh = new THREE.Mesh(new THREE.CylinderGeometry(live ? 20 : 13, live ? 12 : 8, height * 0.6, 32, 1, true), beam)
    haloMesh.position.y = (height * 0.6) / 2
    haloMesh.scale.setScalar(1)
    group.add(beamMesh, coreMesh, haloMesh)

    const cone = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: coneFrag,
      uniforms: { uColor: { value: color }, uIntensity: { value: 0.4 + density * 1.6 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const coneH = 150
    const coneMesh = new THREE.Mesh(new THREE.ConeGeometry(30 + density * 50, coneH, 48, 1, true), cone)
    coneMesh.position.y = coneH / 2
    group.add(coneMesh)

    const ring = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: ringFrag,
      uniforms: { uColor: { value: color }, uTime: { value: Math.random() * 3 }, uLive: { value: live ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), ring)
    ringMesh.rotation.x = -Math.PI / 2
    ringMesh.position.y = 1
    group.add(ringMesh)

    const b: Beacon = { ev, group, beam, cone, ring }

    if (live) {
      const n = Math.max(5, Math.min(16, Math.round(ev.attendees / 28)))
      const radius = 48 + density * 26
      const phase = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + Math.random() * 0.3)
      const heights = Array.from({ length: n }, () => 40 + Math.random() * 70)
      const pos = new Float32Array(n * 3)
      const idx = new Float32Array(n).map((_, i) => (i + ev.attendees) % 8)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1))
      const pts = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          vertexShader: orbitVert,
          fragmentShader: orbitFrag,
          uniforms: { uAtlas: { value: this.atlas }, uSize: { value: 18 * this.dpr }, uRing: { value: VIOLET } },
          transparent: false,
        }),
      )
      pts.frustumCulled = false
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3))
      const lines = new THREE.LineSegments(
        lg,
        new THREE.LineBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      lines.frustumCulled = false
      group.add(pts, lines)
      b.orbit = { pts, lines, n, radius, phase, height: heights }
    }

    group.traverse((o) => (o.frustumCulled = false))
    this.scene.add(group)
    return b
  }

  private clear() {
    if (this.landmarks) {
      this.scene.remove(this.landmarks.group)
      this.landmarks.dispose()
      this.landmarks = null
    }
    if (this.station) {
      this.scene.remove(this.station.group)
      this.station.dispose()
      this.station = null
    }
    for (const b of this.beacons) {
      this.scene.remove(b.group)
      b.group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    }
    this.beacons = []
  }

  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
    opts: { modelViewProjectionMatrix: ArrayLike<number>; defaultProjectionData?: { mainMatrix: ArrayLike<number> } } | ArrayLike<number>,
  ) {
    if (!this.origin || this.map.getZoom() < 10) return // city-scale art: nothing to draw from space
    this.clock.update()
    const t = this.reduced ? 0 : this.clock.getElapsed()
    // MapLibre 5: mainMatrix maps mercator [0..1] → clip space (modelViewProjectionMatrix is in world pixels)
    const mvp = 'modelViewProjectionMatrix' in opts ? (opts.defaultProjectionData?.mainMatrix ?? opts.modelViewProjectionMatrix) : opts

    for (const b of this.beacons) {
      const sel = this.selected === b.ev.id
      const live = b.ev.status === 'live'
      b.beam.uniforms.uTime.value = t
      b.ring.uniforms.uTime.value = t
      b.cone.uniforms.uTime.value = t
      const breathe = live && !this.reduced ? 0.8 + 0.2 * Math.sin(t * 2.6 + b.ev.attendees) : 1
      b.beam.uniforms.uIntensity.value = (live ? 1 : 0.65) * breathe * (sel ? 1.9 : 1)
      b.group.scale.setScalar(sel ? 1.25 : 1)
      if (b.orbit) {
        const { pts, lines, n, radius, phase, height } = b.orbit
        const p = pts.geometry.getAttribute('position') as THREE.BufferAttribute
        const l = lines.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < n; i++) {
          const a = phase[i] + t * 0.25 * (i % 2 ? 1 : -0.8)
          const r = radius * (1 + 0.12 * Math.sin(t * 0.7 + i))
          const y = height[i] + Math.sin(t + i) * 6
          p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r)
          l.setXYZ(i * 2, Math.cos(a) * r, y, Math.sin(a) * r)
          l.setXYZ(i * 2 + 1, 0, y * 0.6 + 40, 0)
        }
        p.needsUpdate = true
        l.needsUpdate = true
      }
    }
    this.compass?.tick(t, this.map.getZoom())
    this.landmarks?.tick(t)
    this.station?.tick(t)

    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(Array.from(mvp)).multiply(this.originMatrix)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    if (!this.reduced) this.map.triggerRepaint()
  }
}
