import * as THREE from 'three'

/**
 * The Colosseum as a glitching hologram, floating over the real amphitheatre in Rome (Colosseum.com · "Enter the arena").
 * Look (from the campaign stills): dark grey wireframe-ish arena drawn in horizontal scan lines, with white / violet /
 * teal glitch streaks tearing across it. Geometry is procedural: real ellipse (189 × 156 m, 48 m high), three arcaded
 * tiers + attic on the surviving north side, the lower inner ring everywhere, the stepped cavea and the arena floor.
 *
 * Frame: X = long axis, Y = up, Z = minor axis (−Z = north side). The caller's toLocal() gives metres (x east, z south).
 */

export const COLOSSEUM_CENTER: [number, number] = [12.4922, 41.8902]
const LONG_AXIS_BEARING = 100 // ° from north, clockwise (the arena's long axis runs WNW–ESE)
const A = 94.5 // semi-major, m
const B = 78 // semi-minor, m
const TIER = 12.4 // one arcade storey
const ATTIC = 10.5
const HOVER = 58 // metres above the real site
const GREY = new THREE.Color('#b9b9c6')
const VIOLET = new THREE.Color('#c77dff')
const TEAL = new THREE.Color('#5de0c8')
const WHITE = new THREE.Color('#ffffff')

// scan-line hologram: horizontal lines, CRT tear (rows jump sideways for a frame), a slow upward sweep
const holoVert = /* glsl */ `
  uniform float uTime; varying vec3 vPos; varying vec3 vNormal; varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main(){
    vPos = position; vNormal = normal; vUv = uv;
    vec3 p = position;
    float row = floor(position.y * 0.9);
    float frame = floor(uTime * 9.0);
    float tear = step(0.965, hash(row * 7.31 + frame * 13.7)) * (hash(row * 3.1 + frame) - 0.5) * 9.0;
    p.x += tear;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const holoFrag = /* glsl */ `
  uniform vec3 uC; uniform float uTime; uniform float uAlpha; uniform float uFocus; uniform float uArches; uniform float uArchW; uniform float uH;
  varying vec3 vPos; varying vec3 vNormal; varying vec2 vUv;
  void main(){
    // arcades: an arch-shaped hole per bay (uv.x = bays along the band, uv.y = 0..1 up the storey); top/bottom faces carry uv.x < 0
    if (uArches > 0.0 && vUv.x >= 0.0) {
      float sx = (fract(vUv.x * uArches) - 0.5) * uArchW;
      float sy = vUv.y * uH;
      float hw = 0.3 * uArchW;
      float springline = 0.5 * uH;
      bool hole = (abs(sx) < hw && sy < springline) || (sy >= springline && length(vec2(sx, (sy - springline) * 0.8)) < hw);
      if (hole) discard;
    }
    float line = 1.0 - smoothstep(0.36, 0.5, abs(fract(vPos.y * 1.6) - 0.5)); // bright scan line, thin dark gap at each row edge
    float facing = 0.8 + 0.2 * abs(vNormal.y);
    float sweep = smoothstep(0.06, 0.0, abs(fract(vPos.y / 60.0 - uTime * 0.08) - 0.5)) * 0.5;
    float flicker = 0.9 + 0.1 * sin(uTime * 37.0 + vPos.y * 0.7);
    float a = uAlpha * (0.25 + 0.75 * line) * flicker * (1.0 + 0.6 * uFocus) + sweep * 0.3;
    gl_FragColor = vec4(uC * (0.9 + sweep + 0.4 * uFocus) * facing, a);
  }
`
const streakFrag = /* glsl */ `
  uniform vec3 uC; uniform float uA; varying vec2 vUv;
  void main(){ float e = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x); gl_FragColor = vec4(uC, uA * e); }
`
const uvVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const ringFrag = /* glsl */ `
  uniform vec3 uC; uniform float uTime; varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
    float t = fract(uTime * 0.18);
    float wave = smoothstep(0.03, 0.0, abs(r - t)) * (1.0 - t) * 0.7;
    float rim = smoothstep(0.03, 0.0, abs(r - 0.97)) * 0.5;
    gl_FragColor = vec4(uC * (wave + rim), wave + rim);
  }
`

export type ColosseumHandle = { group: THREE.Group; tick: (t: number) => void; focus: (on: boolean) => void; dispose: () => void }

/** A band following the ellipse (outer face, inner face, top, bottom) between two parametric angles. */
function ellipseBand(a: number, b: number, thick: number, y0: number, h: number, t0 = 0, t1 = Math.PI * 2, segs = 96): THREE.BufferGeometry {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const n = Math.max(8, Math.round((segs * (t1 - t0)) / (Math.PI * 2)))
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const c = Math.cos(t)
    const s = Math.sin(t)
    const nx = c / a
    const nz = s / b
    const len = Math.hypot(nx, nz) || 1
    const ox = a * c
    const oz = b * s
    const ix = (a - thick) * c
    const iz = (b - thick) * s
    // 4 verts per station: outer-bottom, outer-top, inner-top, inner-bottom
    const f = i / n
    // 8 verts per station: walls (outer-bottom, outer-top, inner-top, inner-bottom) + the same again for top/bottom faces (no arches)
    pos.push(ox, y0, oz, ox, y0 + h, oz, ix, y0 + h, iz, ix, y0, iz, ox, y0, oz, ox, y0 + h, oz, ix, y0 + h, iz, ix, y0, iz)
    nrm.push(nx / len, 0, nz / len, nx / len, 0, nz / len, -nx / len, 0, -nz / len, -nx / len, 0, -nz / len, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0)
    uv.push(f, 0, f, 1, f, 1, f, 0, -1, 0, -1, 1, -1, 1, -1, 0)
    if (i < n) {
      const k = i * 8
      const q = (p0: number, p1: number, p2: number, p3: number) => idx.push(p0, p1, p2, p0, p2, p3)
      q(k, k + 1, k + 9, k + 8) // outer face
      q(k + 3, k + 11, k + 10, k + 2) // inner face
      q(k + 5, k + 6, k + 14, k + 13) // top
      q(k + 4, k + 12, k + 15, k + 7) // bottom
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

export function buildColosseum(toLocal: (ll: [number, number]) => [number, number], dpr: number): ColosseumHandle {
  const root = new THREE.Group()
  const [cE, cS] = toLocal(COLOSSEUM_CENTER)
  root.position.set(cE, 0, cS)
  root.rotation.y = ((90 - LONG_AXIS_BEARING) * Math.PI) / 180

  const holo = new THREE.Group() // everything that floats
  holo.position.y = HOVER
  root.add(holo)

  const mats: THREE.ShaderMaterial[] = []
  const bodyMats: THREE.ShaderMaterial[] = []
  /** arches = bays along the band (0 = solid), archW = bay width in m, h = storey height in m */
  const body = (alpha: number, arches = 0, archW = 7, h = TIER, color = GREY) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: holoVert, fragmentShader: holoFrag,
      uniforms: { uC: { value: color }, uTime: { value: 0 }, uAlpha: { value: alpha }, uFocus: { value: 0 }, uArches: { value: arches }, uArchW: { value: archW }, uH: { value: h } },
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })
    mats.push(m)
    bodyMats.push(m)
    return m
  }
  const edgeMat = new THREE.LineBasicMaterial({ color: '#ececf4', transparent: true, opacity: 0.7, depthWrite: false, depthTest: false })
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, edges = true, order = 5) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = order
    holo.add(mesh)
    if (edges) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), edgeMat)
      e.renderOrder = order + 1
      holo.add(e)
    }
    return mesh
  }

  // ── outer wall: three arcades + attic, only on the surviving (north) side
  const S0 = Math.PI * 1.08 // parametric arc of the surviving outer ring (−Z = north)
  const S1 = Math.PI * 1.98
  const outerArc = ((S1 - S0) / (Math.PI * 2)) * Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B))) // Ramanujan
  const bays = 36
  for (let k = 0; k < 3; k++) {
    const y0 = k * TIER
    add(ellipseBand(A, B, 4.2, y0, TIER - 2.2, S0, S1), body(0.62, bays, outerArc / bays, TIER - 2.2), false)
    add(ellipseBand(A + 0.5, B + 0.5, 5, y0 + TIER - 2.2, 2.2, S0, S1), body(0.7)) // entablature between storeys
  }
  add(ellipseBand(A, B, 3.4, 3 * TIER, ATTIC, S0, S1), body(0.6)) // attic
  // outer-wall ends (the broken edges) read as solid slabs
  for (const t of [S0, S1]) {
    const g = new THREE.BoxGeometry(3.4, 3 * TIER + ATTIC, 6)
    const mesh = add(g, body(0.75), true, 6)
    mesh.position.set(A * Math.cos(t), (3 * TIER + ATTIC) / 2, B * Math.sin(t))
    mesh.rotation.y = -Math.atan2(-A * Math.sin(t), B * Math.cos(t))
  }

  // ── inner ring (the lower wall that survives all round) and the stepped cavea
  const innerPer = Math.PI * (3 * (A * 0.86 + B * 0.86) - Math.sqrt((3 * A * 0.86 + B * 0.86) * (A * 0.86 + 3 * B * 0.86)))
  add(ellipseBand(A * 0.86, B * 0.86, 3, 0, TIER - 1.5), body(0.55, 64, innerPer / 64, TIER - 1.5), false)
  add(ellipseBand(A * 0.86 + 0.4, B * 0.86 + 0.4, 3.8, TIER - 1.5, 1.5), body(0.65))
  add(ellipseBand(A * 0.86, B * 0.86, 3, TIER, TIER - 1.5), body(0.55, 64, innerPer / 64, TIER - 1.5), false)
  const steps: [number, number][] = [[0.78, 21], [0.7, 16.5], [0.62, 12], [0.55, 8], [0.49, 4.5]]
  for (const [f, h] of steps) add(ellipseBand(A * f, B * f, A * 0.08, 0, h, 0, Math.PI * 2, 80), body(0.38), true)
  // arena floor + the hypogeum grid under it
  const floorGeo = new THREE.CircleGeometry(1, 72).scale(A * 0.45, B * 0.45, 1)
  const floor = add(floorGeo, body(0.28), false, 4)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 1.2
  const gridGeo = new THREE.BufferGeometry()
  const gp: number[] = []
  for (let x = -A * 0.42; x <= A * 0.42; x += 9) gp.push(x, 0.6, -B * 0.42, x, 0.6, B * 0.42)
  for (let z = -B * 0.42; z <= B * 0.42; z += 9) gp.push(-A * 0.42, 0.6, z, A * 0.42, 0.6, z)
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3))
  const grid = new THREE.LineSegments(gridGeo, edgeMat)
  grid.renderOrder = 4
  holo.add(grid)

  // ── glitch streaks: thin bright bars that jump around the hologram
  const streakGeo = new THREE.PlaneGeometry(1, 1)
  const streaks: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; seed: number }[] = []
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: streakFrag, uniforms: { uC: { value: i % 3 === 0 ? VIOLET : i % 3 === 1 ? TEAL : WHITE }, uA: { value: 0.9 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    mats.push(mat)
    const mesh = new THREE.Mesh(streakGeo, mat)
    mesh.renderOrder = 9
    holo.add(mesh)
    streaks.push({ mesh, mat, seed: Math.random() * 1000 })
  }

  // ── on the ground: the footprint ring on the real site + a faint column up to the hologram
  const ringMat = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: ringFrag, uniforms: { uC: { value: VIOLET }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  mats.push(ringMat)
  const ring = new THREE.Mesh(new THREE.CircleGeometry(1, 96).scale(A + 14, B + 14, 1), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.8
  ring.renderOrder = 2
  root.add(ring)
  root.traverse((o) => (o.frustumCulled = false))
  void dpr

  const H = 3 * TIER + ATTIC
  return {
    group: root,
    tick: (t) => {
      for (const m of mats) if (m.uniforms.uTime) m.uniforms.uTime.value = t
      holo.position.y = HOVER + Math.sin(t * 0.6) * 2.5
      holo.rotation.y = Math.sin(t * 0.15) * 0.06 // a slow sway, not a spin: it stays aligned with the real site
      for (const s of streaks) {
        // a new place every 0.25–1 s, visible only part of the time → "tearing" look
        const slot = Math.floor(t * (1.2 + (s.seed % 1) * 2.4) + s.seed)
        const h = (n: number) => (Math.sin(slot * 12.9898 + n * 78.233) * 43758.5453) % 1
        const on = Math.abs(h(1)) > 0.45
        s.mesh.visible = on
        if (!on) continue
        const len = 18 + Math.abs(h(2)) * 70
        const x = (h(3) - (h(3) > 0 ? 0.5 : -0.5)) * 2 * (A + 40) + Math.sin(t * 25 + s.seed) * 2
        const y = Math.abs(h(4)) * (H + 12) - 4
        const z = (h(5) - (h(5) > 0 ? 0.5 : -0.5)) * 2 * (B + 40)
        s.mesh.position.set(x, y, z)
        s.mesh.scale.set(len, 1.1 + Math.abs(h(6)) * 1.2, 1)
        s.mesh.rotation.y = Math.abs(h(7)) > 0.5 ? 0 : Math.PI / 2
        s.mat.uniforms.uA!.value = 0.5 + Math.abs(h(8)) * 0.5
      }
    },
    focus: (on) => {
      for (const m of bodyMats) m.uniforms.uFocus!.value = on ? 1 : 0
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
      streakGeo.dispose()
    },
  }
}
