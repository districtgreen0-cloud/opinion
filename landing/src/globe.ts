import * as THREE from 'three'

/** Shared progress object: GSAP tweens these, the globe only reads them (never its own scroll math). */
export interface GlobeState { dive: number; arcs: number; spin: number }

export const CITIES = [
  { name: 'London', lat: 51.5101, lon: -0.1167 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { name: 'Beograd', lat: 44.7866, lon: 20.4489 },
  { name: 'Novi Sad', lat: 45.2671, lon: 19.8335 },
]

export function llToVec(lat: number, lon: number, r = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + 180)
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

let maskPromise: Promise<ImageData | null> | null = null
function loadMask(): Promise<ImageData | null> {
  maskPromise ??= new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const x = c.getContext('2d', { willReadFrequently: true })!
      x.drawImage(img, 0, 0)
      res(x.getImageData(0, 0, c.width, c.height))
    }
    img.onerror = () => res(null)
    img.src = '/earth-mask.png'
  })
  return maskPromise
}

function landPoints(mask: ImageData | null, count: number) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  let i = 0, guard = 0
  while (i < count && guard++ < count * 40) {
    const z = Math.random() * 2 - 1
    const lat = THREE.MathUtils.radToDeg(Math.asin(z))
    const lon = Math.random() * 360 - 180
    if (mask) {
      const u = Math.floor(((lon + 180) / 360) * (mask.width - 1))
      const v = Math.floor(((90 - lat) / 180) * (mask.height - 1))
      if (mask.data[(v * mask.width + u) * 4] > 128) continue // white = water
    }
    const p = llToVec(lat, lon, 1)
    pos.set([p.x, p.y, p.z], i * 3)
    seed[i] = Math.random()
    i++
  }
  return { pos: pos.subarray(0, i * 3), seed: seed.subarray(0, i) }
}

const pointVS = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uSize, uPR, uDive;
  varying float vAlpha;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(world.xyz);
    vec3 toCam = normalize(cameraPosition - world.xyz);
    float facing = dot(n, toCam);
    float tw = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed * 2.0) + aSeed * 40.0);
    vec4 mv = viewMatrix * world;
    float z = -mv.z;
    vAlpha = smoothstep(-0.15, 0.55, facing) * tw * smoothstep(0.03, 0.35, z);
    float sz = uSize * uPR * (0.7 + aSeed * 0.6) * (1.0 + uDive * 0.8) / z;
    gl_PointSize = min(sz, uPR * (3.2 + uDive * 3.0));
    gl_Position = projectionMatrix * mv;
  }
`
const pointFS = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.1, d) * vAlpha);
  }
`
const rimVS = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const rimFS = /* glsl */ `
  uniform float uI; varying vec3 vN; varying vec3 vV;
  void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(vec3(1.0), f * uI); }
`
const arcVS = /* glsl */ `
  attribute float aT; varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const arcFS = /* glsl */ `
  uniform float uHead, uTail; varying float vT;
  void main() {
    if (vT > uHead || vT < uTail) discard;
    float a = 0.6 * smoothstep(uTail, uTail + 0.15, vT);
    gl_FragColor = vec4(vec3(1.0), a);
  }
`

export interface GlobeOpts { points: number; arcs?: boolean; interactive?: boolean; dive?: boolean; static?: boolean }

export class Globe {
  state: GlobeState = { dive: 0, arcs: 0, spin: 0 }
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50)
  private root = new THREE.Group()
  private pointsMat: THREE.ShaderMaterial
  private arcMats: THREE.ShaderMaterial[] = []
  private pins: THREE.Mesh[] = []
  private solFill: THREE.MeshBasicMaterial | null = null
  private idle = 0.9
  private target = new THREE.Euler()
  private visible = true
  private raf = 0
  private last = performance.now()
  private io: IntersectionObserver
  private ro: ResizeObserver
  private disposables: { dispose(): void }[] = []
  private pointer = { x: 0, y: 0 }

  constructor(private canvas: HTMLCanvasElement, private opts: GlobeOpts) {
    const desktop = matchMedia('(min-width: 900px)').matches
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: desktop, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(0, 0, 4.6)
    this.scene.add(this.root)

    // Opaque black core writes depth so the far side is hidden.
    const coreGeo = new THREE.SphereGeometry(0.985, 64, 48)
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }))
    this.root.add(core)

    // White fresnel rim.
    const rimGeo = new THREE.SphereGeometry(1.012, 64, 48)
    const rimMat = new THREE.ShaderMaterial({ vertexShader: rimVS, fragmentShader: rimFS, uniforms: { uI: { value: 0.32 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    this.root.add(new THREE.Mesh(rimGeo, rimMat))

    // Graticule.
    const gPts: number[] = []
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -90; lat < 90; lat += 3) {
      const a = llToVec(lat, lon, 1.002), b = llToVec(lat + 3, lon, 1.002); gPts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 3) {
      const a = llToVec(lat, lon, 1.002), b = llToVec(lat, lon + 3, 1.002); gPts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    const gGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gPts, 3))
    const gMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.055, depthWrite: false })
    this.root.add(new THREE.LineSegments(gGeo, gMat))

    // Points (filled once the mask decodes).
    this.pointsMat = new THREE.ShaderMaterial({
      vertexShader: pointVS, fragmentShader: pointFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: desktop ? 13 : 11 }, uPR: { value: this.renderer.getPixelRatio() }, uDive: { value: 0 } },
    })
    loadMask().then((mask) => {
      const { pos, seed } = landPoints(mask, opts.points)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
      this.root.add(new THREE.Points(geo, this.pointsMat))
      this.disposables.push(geo)
      if (opts.static) this.render(0)
    })

    // City pins.
    const ringGeo = new THREE.RingGeometry(0.018, 0.026, 32)
    for (const c of CITIES) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
      const p = llToVec(c.lat, c.lon, 1.006)
      m.position.copy(p)
      m.lookAt(p.clone().multiplyScalar(2))
      this.root.add(m); this.pins.push(m)
      const dotGeo = new THREE.CircleGeometry(0.007, 16)
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      dot.position.copy(p); dot.lookAt(p.clone().multiplyScalar(2)); this.root.add(dot)
      this.disposables.push(dotGeo, dot.material as THREE.Material, m.material as THREE.Material)
    }

    // One detailed Solana-coloured hex on London (where the dive lands).
    {
      const purple = new THREE.Color('#9945FF'), green = new THREE.Color('#14F195')
      const hexPts = (r: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0) })
      const tint = (geo: THREE.BufferGeometry, r: number) => {
        const pos = geo.getAttribute('position')
        const cols: number[] = []
        for (let i = 0; i < pos.count; i++) { const c = purple.clone().lerp(green, (pos.getX(i) / r + 1) / 2); cols.push(c.r, c.g, c.b) }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
        return geo
      }
      const R = 0.055
      const g = new THREE.Group()
      const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
      const outer = tint(new THREE.BufferGeometry().setFromPoints(hexPts(R)), R)
      const inner = tint(new THREE.BufferGeometry().setFromPoints(hexPts(R * 0.6)), R)
      const spokes = tint(new THREE.BufferGeometry().setFromPoints(hexPts(R).flatMap((v) => [v.clone().multiplyScalar(0.6), v])), R)
      const fillGeo = tint(new THREE.ShapeGeometry(new THREE.Shape(hexPts(R).map((v) => new THREE.Vector2(v.x, v.y)))), R)
      this.solFill = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      g.add(new THREE.LineLoop(outer, lineMat), new THREE.LineLoop(inner, lineMat), new THREE.LineSegments(spokes, lineMat), new THREE.Mesh(fillGeo, this.solFill))
      const p = llToVec(CITIES[0].lat, CITIES[0].lon, 1.008)
      g.position.copy(p)
      g.lookAt(p.clone().multiplyScalar(2))
      this.root.add(g)
      this.disposables.push(lineMat, outer, inner, spokes, fillGeo, this.solFill)
    }

    // Great-circle arcs between cities in sequence.
    if (opts.arcs) {
      const order = [0, 3, 4, 0, 1, 2]
      for (let i = 0; i < order.length - 1; i++) {
        const a = llToVec(CITIES[order[i]].lat, CITIES[order[i]].lon, 1.006)
        const b = llToVec(CITIES[order[i + 1]].lat, CITIES[order[i + 1]].lon, 1.006)
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const lift = 1 + a.distanceTo(b) * 0.42
        mid.normalize().multiplyScalar(lift)
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
        const pts = curve.getPoints(80)
        const geo = new THREE.BufferGeometry().setFromPoints(pts)
        geo.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, k) => k / 80), 1))
        const mat = new THREE.ShaderMaterial({ vertexShader: arcVS, fragmentShader: arcFS, transparent: true, depthWrite: false, uniforms: { uHead: { value: 0 }, uTail: { value: 0 } } })
        this.root.add(new THREE.Line(geo, mat)); this.arcMats.push(mat); this.disposables.push(geo, mat)
      }
    }

    // Rotation that puts London facing the camera (+z).
    const ldn = llToVec(CITIES[0].lat, CITIES[0].lon)
    const ry = Math.atan2(-ldn.x, ldn.z)
    const r = Math.hypot(ldn.x, ldn.z)
    this.target.set(Math.atan2(ldn.y, r), ry, 0)
    this.idle = ry - 0.9

    this.disposables.push(coreGeo, core.material, rimGeo, rimMat, gGeo, gMat, ringGeo, this.pointsMat, this.renderer)

    if (opts.interactive) addEventListener('pointermove', this.onPointer, { passive: true })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.loop() }, { rootMargin: '100px' })
    this.io.observe(canvas)
    this.resize()
    if (!opts.static) this.loop()
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.x = e.clientX / innerWidth - 0.5
    this.pointer.y = e.clientY / innerHeight - 0.5
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.opts.static) this.render(0)
  }

  private loop = () => {
    cancelAnimationFrame(this.raf)
    if (!this.visible || this.opts.static) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    this.render(dt)
  }

  render(dt: number) {
    const s = this.state
    const t = (this.pointsMat.uniforms.uTime.value += dt)
    this.idle += dt * 0.06 * (1 - s.dive)

    // Dive: blend idle spin into the London-facing rotation, dolly in and widen FOV.
    const d = s.dive
    const tY = this.target.y + Math.PI * 2 * Math.round((this.idle - this.target.y) / (Math.PI * 2))
    const ease = d * d * (3 - 2 * d)
    const px = this.opts.interactive ? this.pointer.y * 0.12 * (1 - d) : 0
    const py = this.opts.interactive ? this.pointer.x * 0.2 * (1 - d) : 0
    this.root.rotation.y = THREE.MathUtils.lerp(this.idle + py, tY, ease) + s.spin
    this.root.rotation.x = THREE.MathUtils.lerp(0.32 + px, this.target.x, ease)
    if (this.opts.dive) {
      this.camera.position.z = THREE.MathUtils.lerp(4.6, 1.05, d * d)
      this.camera.fov = THREE.MathUtils.lerp(35, 70, d)
      this.camera.updateProjectionMatrix()
    }
    this.pointsMat.uniforms.uDive.value = d

    // Solana hex breathes.
    if (this.solFill) this.solFill.opacity = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.2))

    // Pins pulse.
    this.pins.forEach((p, i) => {
      const k = (t * 0.6 + i * 0.21) % 1
      p.scale.setScalar(1 + k * 2.2)
      ;(p.material as THREE.MeshBasicMaterial).opacity = 1 - k
    })

    // Arcs draw in sequence, then their tails chase.
    const n = this.arcMats.length
    this.arcMats.forEach((m, i) => {
      const local = s.arcs * (n + 1.2) - i
      m.uniforms.uHead.value = THREE.MathUtils.clamp(local, 0, 1)
      m.uniforms.uTail.value = THREE.MathUtils.clamp(local - 1.2, 0, 1)
    })

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.io.disconnect(); this.ro.disconnect()
    removeEventListener('pointermove', this.onPointer)
    this.disposables.forEach((d) => d.dispose())
  }
}
