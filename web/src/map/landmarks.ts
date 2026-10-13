import * as THREE from 'three'
import data from '../data/london-landmarks.json'

/**
 * Real venue buildings (OSM footprints) re-built as lit Solana glass.
 * Scene units: metres, x = east, y = up, z = south (same as BeaconLayer).
 */

type Part = { ring: [number, number][]; height: number; minHeight: number; kind: string; name: string }
type Venue = { id: 'olympia' | 'somerset'; name: string; center: [number, number]; parts: Part[] }

// OSM only has level-count guesses for these; approximate real roof heights (metres)
const HEIGHT_OVERRIDE: Record<string, number> = {
  'Olympia Grand': 34, // the great barrel-vaulted hall
  'Olympia National': 24,
  'Somerset House': 24,
}
const DEFAULT_HEIGHT: Record<Venue['id'], number> = { olympia: 20, somerset: 22 }

const PURPLE = new THREE.Color('#9945ff')
const GREEN = new THREE.Color('#14f195')
const CYAN = new THREE.Color('#00c2ff')

const glassVert = /* glsl */ `
  uniform float uTop;
  varying vec3 vPos; varying vec3 vNormal;
  void main(){
    vPos = position; vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
// gradient glass: purple at street level → green at the roofline, with floor lines,
// a rising scan sweep and brighter roof / edges so the volume reads as lit from inside
const glassFrag = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uTime; uniform float uTop; uniform float uFocus;
  varying vec3 vPos; varying vec3 vNormal;
  void main(){
    float h = clamp(vPos.y / uTop, 0.0, 1.0);
    float diag = fract((vPos.x + vPos.z) * 0.004 + uTime * 0.03);
    vec3 base = mix(uA, uB, smoothstep(0.0, 1.0, h));
    base = mix(base, uC, 0.25 * sin(diag * 6.2831) * 0.5 + 0.12);
    float roof = step(0.85, abs(vNormal.y));
    float floors = smoothstep(0.08, 0.0, abs(fract(vPos.y / 4.0) - 0.5) - 0.42) * (1.0 - roof);
    float scan = smoothstep(0.06, 0.0, abs(h - fract(uTime * 0.18))) * (1.0 - roof);
    float a = 0.26 + 0.22 * h + floors * 0.35 + scan * 0.55 + roof * 0.25;
    a *= (0.8 + 0.4 * uFocus);
    vec3 col = base * (0.9 + floors * 0.8 + scan * 1.6 + roof * 0.6) + vec3(scan * 0.25);
    gl_FragColor = vec4(col * a, a);
  }
`

const ringVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const ringFrag = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform float uTime;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x) / 6.2831 + 0.5;
    vec3 c = mix(uA, uB, ang);
    float pulse = smoothstep(0.05, 0.0, abs(r - fract(uTime * 0.25))) * (1.0 - fract(uTime * 0.25));
    float glow = pow(1.0 - r, 2.2) * 0.35;
    float rim = smoothstep(0.012, 0.0, abs(r - 0.96)) * 0.7;
    float a = glow + pulse * 0.8 + rim;
    gl_FragColor = vec4(c * a, a);
  }
`
const beamFrag = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform float uTime;
  varying vec2 vUv;
  void main(){
    float h = vUv.y;
    float edge = pow(abs(sin(vUv.x * 3.14159)), 0.5);
    float fade = pow(1.0 - h, 1.3);
    float scan = 0.7 + 0.3 * sin(h * 30.0 - uTime * 2.5);
    vec3 c = mix(uA, uB, h);
    float a = fade * edge * scan * 1.4;
    gl_FragColor = vec4(c * a, a);
  }
`
const sparkVert = /* glsl */ `
  attribute float aSeed; uniform float uTime; uniform float uSize; uniform float uTop;
  varying float vMix; varying float vFade;
  void main(){
    vec3 p = position;
    float t = fract(uTime * (0.05 + aSeed * 0.05) + aSeed);
    p.y += t * (uTop * 3.0);
    p.x += sin(uTime * 0.6 + aSeed * 40.0) * 6.0;
    vMix = aSeed; vFade = sin(t * 3.14159);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed);
  }
`
const sparkFrag = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; varying float vMix; varying float vFade;
  void main(){
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.0, r) * vFade;
    gl_FragColor = vec4(mix(uA, uB, vMix) * a, a);
  }
`

export type LandmarkHandle = { group: THREE.Group; tick: (t: number) => void; focus: (id: string | null) => void; dispose: () => void }

export function buildLandmarks(toLocal: (lngLat: [number, number]) => [number, number], dpr: number): LandmarkHandle {
  const group = new THREE.Group()
  const mats: THREE.ShaderMaterial[] = []
  const venues = (data as unknown as { venues: Venue[] }).venues
  const focusMats = new Map<string, THREE.ShaderMaterial[]>()
  const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }

  for (const v of venues) {
    const vg = new THREE.Group()
    const vm: THREE.ShaderMaterial[] = []
    let top = 0
    const [cx, cz] = toLocal(v.center)

    for (const part of v.parts) {
      const height = HEIGHT_OVERRIDE[part.name] ?? (part.height > 10 ? part.height : DEFAULT_HEIGHT[v.id])
      top = Math.max(top, height)
      // footprint in local metres; shape plane is (east, north) so it extrudes upward after rotation
      const pts = part.ring.map(([lng, lat]) => {
        const [x, z] = toLocal([lng, lat])
        return new THREE.Vector2(x, -z)
      })
      const shape = new THREE.Shape(pts)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: height - part.minHeight, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, part.minHeight + 0.4, 0) // sit a hair above the map's own extrusion → no z-fighting
      const mat = new THREE.ShaderMaterial({
        vertexShader: glassVert,
        fragmentShader: glassFrag,
        uniforms: { uA: { value: PURPLE }, uB: { value: GREEN }, uC: { value: CYAN }, uTime: { value: 0 }, uTop: { value: height }, uFocus: { value: 0 } },
        ...common,
        side: THREE.DoubleSide,
        // draw over the map's own (translucent) buildings so the venue always glows through the city
        depthTest: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = 3
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 20),
        new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
      )
      edges.renderOrder = 4
      vg.add(mesh, edges)
      vm.push(mat)
      mats.push(mat)
    }

    // ground halo
    const ringMat = new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: ringFrag, uniforms: { uA: { value: PURPLE }, uB: { value: GREEN }, uTime: { value: 0 } }, ...common })
    const ring = new THREE.Mesh(new THREE.CircleGeometry(v.id === 'olympia' ? 260 : 190, 96), ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(cx, 0.8, cz)
    ring.renderOrder = 2
    // light column rising from the roof
    const beamMat = new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: beamFrag, uniforms: { uA: { value: PURPLE }, uB: { value: GREEN }, uTime: { value: 0 } }, ...common, side: THREE.DoubleSide })
    const beamH = 520
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, beamH, 32, 1, true), beamMat)
    beam.position.set(cx, top + beamH / 2, cz)
    // rising sparks
    const n = 260
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 30 + Math.random() * (v.id === 'olympia' ? 200 : 140)
      pos.set([cx + Math.cos(a) * r, Math.random() * 10, cz + Math.sin(a) * r], i * 3)
      seed[i] = Math.random()
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const sparkMat = new THREE.ShaderMaterial({ vertexShader: sparkVert, fragmentShader: sparkFrag, uniforms: { uA: { value: PURPLE }, uB: { value: GREEN }, uTime: { value: 0 }, uSize: { value: 5 * dpr }, uTop: { value: top } }, ...common })
    const sparks = new THREE.Points(sg, sparkMat)
    vg.add(ring, beam, sparks)
    mats.push(ringMat, beamMat, sparkMat)
    focusMats.set(v.id, vm)
    group.add(vg)
  }
  group.traverse((o) => (o.frustumCulled = false))

  return {
    group,
    tick: (t) => {
      for (const m of mats) m.uniforms.uTime.value = t
    },
    focus: (id) => {
      for (const [vid, list] of focusMats) for (const m of list) m.uniforms.uFocus.value = vid === id ? 1 : 0
    },
    dispose: () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | undefined
        mat?.dispose()
      })
    },
  }
}

export const LANDMARK_VENUES = (data as unknown as { venues: Venue[] }).venues.map((v) => ({ id: v.id, name: v.name, center: v.center }))
