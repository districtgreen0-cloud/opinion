import * as THREE from 'three'
import data from '../data/belgrade-station.json'

/**
 * The Old Belgrade Railway Station (1884, Neo-Renaissance) rebuilt as translucent pastel-gold glass.
 * Footprint = real OSM outline; the architecture (pavilions, arched windows, pilasters, cornices,
 * rustication, mansard roofs, pediment + live clock) is procedural, aligned to the building's long axis.
 *
 * Station frame: X = along the long axis, Y = up, Z = -depth (the front façade faces -Z). The group is
 * rotated/positioned into the map's metre scene (x = east, z = south) by the caller's toLocal().
 */

const LONG_AXIS_DEG = 240.8 // long axis bearing in (east, north) maths angle, from the footprint's OBB
const GOLD_A = new THREE.Color('#e7c88c') // stone at street level
const GOLD_B = new THREE.Color('#fff2d2') // pale gold towards the roofline
const WARM = new THREE.Color('#ffd98a') // lit windows

const glassVert = /* glsl */ `
  varying vec3 vPos; varying vec3 vNormal;
  void main(){ vPos = position; vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
// very transparent gold: brighter edges-on, rusticated ground floor courses, a slow light sweep rising
const glassFrag = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uTop; uniform float uAlpha; uniform float uFocus;
  varying vec3 vPos; varying vec3 vNormal;
  void main(){
    float h = clamp(vPos.y / uTop, 0.0, 1.0);
    vec3 col = mix(uA, uB, smoothstep(0.0, 1.0, h));
    float wall = 1.0 - step(0.85, abs(vNormal.y));
    float rustic = wall * step(vPos.y, 5.2) * smoothstep(0.07, 0.0, abs(fract(vPos.y / 0.9) - 0.5) - 0.44);
    float sweep = wall * smoothstep(0.08, 0.0, abs(h - fract(uTime * 0.07))) ;
    float shimmer = 0.5 + 0.5 * sin(vPos.x * 0.35 + uTime * 0.6);
    float a = uAlpha * (0.75 + 0.25 * shimmer) + rustic * 0.12 + sweep * 0.22;
    a *= (0.85 + 0.35 * uFocus);
    gl_FragColor = vec4(col * (a + sweep * 0.25), a);
  }
`
const windowVert = /* glsl */ `
  attribute float aSeed; varying float vSeed; varying vec2 vUv;
  void main(){ vSeed = aSeed; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }
`
// warm windows: each breathes on its own rhythm, a few "lamps" brighter
const windowFrag = /* glsl */ `
  uniform vec3 uC; uniform float uTime; varying float vSeed; varying vec2 vUv;
  void main(){
    float lamp = step(0.72, fract(vSeed * 7.13));
    float breathe = 0.55 + 0.45 * sin(uTime * (0.6 + vSeed) + vSeed * 40.0);
    float glow = smoothstep(0.0, 0.6, vUv.y) * 0.4 + 0.6;
    float a = (0.38 + 0.32 * breathe + lamp * 0.4) * glow;
    gl_FragColor = vec4(uC * a, a);
  }
`
const dustVert = /* glsl */ `
  attribute float aSeed; uniform float uTime; uniform float uSize; varying float vFade;
  void main(){
    vec3 p = position;
    float t = fract(uTime * (0.03 + aSeed * 0.04) + aSeed);
    p.y += t * 60.0; p.x += sin(uTime * 0.4 + aSeed * 30.0) * 3.0;
    vFade = sin(t * 3.14159);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.5 + aSeed);
  }
`
const dustFrag = /* glsl */ `
  uniform vec3 uC; varying float vFade;
  void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r) * vFade * 0.8; gl_FragColor = vec4(uC * a, a); }
`
const haloFrag = /* glsl */ `
  uniform vec3 uC; uniform float uTime; varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
    float t = fract(uTime * 0.12);
    float wave = smoothstep(0.04, 0.0, abs(r - t)) * (1.0 - t) * 0.6;
    float a = pow(1.0 - r, 2.5) * 0.4 + wave;
    gl_FragColor = vec4(uC * a, a);
  }
`
const uvVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`

export type StationHandle = { group: THREE.Group; tick: (t: number) => void; focus: (on: boolean) => void; dispose: () => void }

type Ring = [number, number][]
const station = data as unknown as { center: [number, number]; ring: Ring; name: string }

export const STATION_CENTER = station.center

export function buildStation(toLocal: (ll: [number, number]) => [number, number], dpr: number): StationHandle {
  const root = new THREE.Group()
  const a = (LONG_AXIS_DEG * Math.PI) / 180
  const [cE, cS] = toLocal(station.center)
  root.position.set(cE, 0, cS)
  root.rotation.y = a

  // footprint in the station frame (lx along the long axis, ly = depth, front = +ly)
  const lat0 = (station.center[1] * Math.PI) / 180
  const kx = 111320 * Math.cos(lat0)
  const ky = 110540
  const toFrame = ([lng, lat]: [number, number]) => {
    const e = (lng - station.center[0]) * kx
    const n = (lat - station.center[1]) * ky
    return new THREE.Vector2(e * Math.cos(-a) - n * Math.sin(-a), e * Math.sin(-a) + n * Math.cos(-a))
  }

  const mats: THREE.ShaderMaterial[] = []
  const glassMats: THREE.ShaderMaterial[] = []
  const common = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }
  const glass = (top: number, alpha: number) => {
    const m = new THREE.ShaderMaterial({ vertexShader: glassVert, fragmentShader: glassFrag, uniforms: { uA: { value: GOLD_A }, uB: { value: GOLD_B }, uTime: { value: 0 }, uTop: { value: top }, uAlpha: { value: alpha }, uFocus: { value: 0 } }, ...common })
    mats.push(m)
    glassMats.push(m)
    return m
  }
  const edgeMat = new THREE.LineBasicMaterial({ color: '#ffe8b8', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
  const solid = (geo: THREE.BufferGeometry, mat: THREE.Material, edges = true) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 5
    root.add(mesh)
    if (edges) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat)
      e.renderOrder = 6
      root.add(e)
    }
    return mesh
  }
  // box from frame ranges: x0..x1 along the axis, y0..y1 depth (front +), z0..z1 height
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, edges = true) => {
    const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0)
    g.translate((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2)
    return solid(g, mat, edges)
  }
  // hip / mansard roof over a rectangle: a frustum with a short ridge
  const hipRoof = (x0: number, x1: number, y0: number, y1: number, base: number, rise: number, mat: THREE.Material) => {
    const w = x1 - x0
    const d = y1 - y0
    const g = new THREE.CylinderGeometry(Math.SQRT1_2, 1, 1, 4, 1, false, Math.PI / 4)
    g.scale(w * 0.98, rise, d * 0.98)
    g.translate((x0 + x1) / 2, base + rise / 2, -(y0 + y1) / 2)
    return solid(g, mat)
  }
  // gable roof along X: an explicit triangular prism (ridge runs along the long axis)
  const gable = (x0: number, x1: number, y0: number, y1: number, base: number, rise: number, mat: THREE.Material) => {
    const ym = (y0 + y1) / 2
    const v = (x: number, y: number, z: number) => [x, z, -y] // frame (x, depth, height) → scene (x, up, -depth)
    const A0 = v(x0, y0, base), B0 = v(x0, y1, base), C0 = v(x0, ym, base + rise)
    const A1 = v(x1, y0, base), B1 = v(x1, y1, base), C1 = v(x1, ym, base + rise)
    const tri = (...p: number[][]) => p.flat()
    const verts = [
      ...tri(A0, B0, C0), ...tri(A1, C1, B1), // gable ends
      ...tri(A0, C0, C1), ...tri(A0, C1, A1), // back slope
      ...tri(B0, B1, C1), ...tri(B0, C1, C0), // front slope
    ]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.computeVertexNormals()
    return solid(g, mat)
  }

  // ── 1. the real footprint, extruded as the main mass (12 m: two tall 19th-century storeys)
  const ring = station.ring.map(toFrame)
  const shape = new THREE.Shape(ring)
  const base = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false })
  base.rotateX(-Math.PI / 2) // (lx, ly, h) → (lx, h, -ly)
  solid(base, glass(24, 0.2))

  // ── 2. pavilions + roofs (measured from the footprint plot: central risalit x 11–26.4, end pavilions)
  const pav = glass(24, 0.24)
  box(11, 26.4, -5.5, 20.3, 12, 19, pav) // central pavilion, taller
  hipRoof(11, 26.4, -5.5, 20.3, 19, 3.2, glass(24, 0.28))
  box(-50.2, -31.5, -4.6, 15.6, 12, 16, pav) // west pavilion
  hipRoof(-50.2, -31.5, -4.6, 15.6, 16, 3.6, glass(24, 0.26))
  box(64.8, 85.5, -6.3, 14.3, 12, 16, pav) // east pavilion
  hipRoof(64.8, 85.5, -6.3, 14.3, 16, 3.6, glass(24, 0.26))
  const roofM = glass(24, 0.18)
  gable(-31.5, 11, -5.2, 10.6, 12, 3, roofM) // main block roofs between pavilions
  gable(26.4, 64.8, -6.0, 9.2, 12, 3, roofM)
  // pediment on the central pavilion front + cornice ledges
  const ped = new THREE.Shape([new THREE.Vector2(11, 0), new THREE.Vector2(26.4, 0), new THREE.Vector2(18.7, 4.2)])
  const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 0.8, bevelEnabled: false })
  pedGeo.translate(0, 19, -20.3 - 0.8)
  solid(pedGeo, glass(24, 0.36))
  const ledge = glass(24, 0.34)
  for (const z of [5.6, 11.8]) {
    box(-31.5, 11, 10.4, 11.0, z, z + 0.45, ledge) // front cornices, main block
    box(26.4, 64.8, 9.0, 9.6, z, z + 0.45, ledge)
  }
  box(11, 26.4, 20.3, 20.9, 18.6, 19.1, ledge)

  // ── 3. arched windows (instanced) + pilasters along the façades
  const archGeo = (() => {
    const w = 1.7
    const h = 3.5
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0)
    s.lineTo(w / 2, 0)
    s.lineTo(w / 2, h - w / 2)
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false)
    s.lineTo(-w / 2, 0)
    return new THREE.ShapeGeometry(s, 16)
  })()
  const placements: { x: number; y: number; z: number; sx: number; sy: number; back: boolean }[] = []
  const facade = (x0: number, x1: number, y: number, back = false, floors: number[] = [1.0, 6.6], step = 4.2) => {
    const n = Math.max(1, Math.floor((x1 - x0) / step))
    const pad = (x1 - x0 - (n - 1) * step) / 2
    for (let i = 0; i < n; i++) for (const f of floors) placements.push({ x: x0 + pad + i * step, y, z: f, sx: 1, sy: f > 5 ? 0.9 : 1, back })
    // pilasters between bays
    for (let i = 0; i <= n; i++) {
      const px = x0 + pad + (i - 0.5) * step
      if (px > x0 - 0.1 && px < x1 + 0.1) box(px - 0.25, px + 0.25, back ? y - 0.35 : y, back ? y : y + 0.35, 0.4, 11.8, ledge, false)
    }
  }
  facade(-31.5, 2.5, 10.6) // front, west main block
  facade(34.1, 64.7, 9.1) // front, east main block
  facade(-50.2, -31.5, 15.6, false, [1.0, 6.6, 12.6], 4.4) // west pavilion: 3 storeys
  facade(64.8, 85.5, 14.3, false, [1.0, 6.6, 12.6], 4.4) // east pavilion
  facade(-38.5, 82.6, -5.4, true) // back (platform side)
  // central pavilion: three tall entrance arches + an upper row
  for (const x of [14.2, 18.7, 23.2]) {
    placements.push({ x, y: 20.3, z: 0.6, sx: 1.6, sy: 2.0, back: false })
    placements.push({ x, y: 20.3, z: 12.6, sx: 1, sy: 1.1, back: false })
  }
  const winMat = new THREE.ShaderMaterial({ vertexShader: windowVert, fragmentShader: windowFrag, uniforms: { uC: { value: WARM }, uTime: { value: 0 } }, ...common })
  mats.push(winMat)
  const windows = new THREE.InstancedMesh(archGeo, winMat, placements.length)
  const seeds = new Float32Array(placements.length)
  const m4 = new THREE.Matrix4()
  placements.forEach((p, i) => {
    const off = p.back ? 0.25 : -0.25 // sit just proud of the wall
    m4.compose(new THREE.Vector3(p.x, p.z, -p.y + (p.back ? off : off)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.back ? 0 : Math.PI, 0)), new THREE.Vector3(p.sx, p.sy, 1))
    windows.setMatrixAt(i, m4)
    seeds[i] = Math.random()
  })
  archGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  windows.renderOrder = 7
  windows.frustumCulled = false
  root.add(windows)

  // ── 4. the clock in the pediment: real Belgrade time
  const clock = new THREE.Group()
  clock.position.set(18.7, 20.6, -20.3 - 1.0)
  clock.rotation.y = Math.PI
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }))
  const rim = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.7, 48), new THREE.MeshBasicMaterial({ color: '#ffe3a6', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }))
  const handMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
  const hourHand = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.85).translate(0, 0.42, 0.01), handMat)
  const minHand = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.25).translate(0, 0.62, 0.02), handMat)
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.25), handMat)
    const ang = (i / 12) * Math.PI * 2
    tick.position.set(Math.sin(ang) * 1.25, Math.cos(ang) * 1.25, 0.01)
    tick.rotation.z = -ang
    clock.add(tick)
  }
  clock.add(face, rim, hourHand, minHand)
  clock.traverse((o) => (o.renderOrder = 8))
  root.add(clock)

  // ── 5. gold halo on the square + rising gold dust
  const haloMat = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: haloFrag, uniforms: { uC: { value: GOLD_B }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  mats.push(haloMat)
  const halo = new THREE.Mesh(new THREE.CircleGeometry(150, 96), haloMat)
  halo.rotation.x = -Math.PI / 2
  halo.position.set(12, 0.6, -5)
  halo.renderOrder = 2
  root.add(halo)
  const n = 320
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    pos.set([-55 + Math.random() * 145, Math.random() * 6, -(-40 + Math.random() * 70)], i * 3)
    seed[i] = Math.random()
  }
  const dg = new THREE.BufferGeometry()
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const dustMat = new THREE.ShaderMaterial({ vertexShader: dustVert, fragmentShader: dustFrag, uniforms: { uC: { value: WARM }, uTime: { value: 0 }, uSize: { value: 4 * dpr } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
  mats.push(dustMat)
  root.add(new THREE.Points(dg, dustMat))

  root.traverse((o) => (o.frustumCulled = false))

  const belgradeTime = () => {
    // Europe/Belgrade wall clock, independent of the viewer's timezone
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(new Date())
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
    return { h: get('hour') % 12, m: get('minute'), s: get('second') }
  }

  return {
    group: root,
    tick: (t) => {
      for (const m of mats) m.uniforms.uTime.value = t
      const { h, m, s } = belgradeTime()
      minHand.rotation.z = -((m + s / 60) / 60) * Math.PI * 2
      hourHand.rotation.z = -((h + m / 60) / 12) * Math.PI * 2
    },
    focus: (on) => {
      for (const m of glassMats) m.uniforms.uFocus.value = on ? 1 : 0
    },
    dispose: () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      edgeMat.dispose()
    },
  }
}
