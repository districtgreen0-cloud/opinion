import * as THREE from 'three'
import { CITIES } from '../data/mock'

const PHONE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820

const toVec = (lng: number, lat: number, r = 1) => {
  const phi = ((90 - lat) * Math.PI) / 180
  const th = ((lng + 180) * Math.PI) / 180
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th))
}

// land mask (white = water), the same one useopinion.io uses
let maskP: Promise<ImageData | null> | null = null
function loadMask(): Promise<ImageData | null> {
  maskP ??= new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const x = c.getContext('2d', { willReadFrequently: true })!
      x.drawImage(img, 0, 0)
      res(x.getImageData(0, 0, c.width, c.height))
    }
    img.onerror = () => res(null)
    img.src = '/earth-mask.png'
  })
  return maskP
}
function landPoints(mask: ImageData | null, count: number) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  let i = 0
  let guard = 0
  while (i < count && guard++ < count * 40) {
    const z = Math.random() * 2 - 1
    const lat = (Math.asin(z) * 180) / Math.PI
    const lon = Math.random() * 360 - 180
    if (mask) {
      const u = Math.floor(((lon + 180) / 360) * (mask.width - 1))
      const v = Math.floor(((90 - lat) / 180) * (mask.height - 1))
      if (mask.data[(v * mask.width + u) * 4]! > 128) continue
    }
    const p = toVec(lon, lat, 1)
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
    float facing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
    float tw = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed * 2.0) + aSeed * 40.0);
    vec4 mv = viewMatrix * world;
    float z = -mv.z;
    vAlpha = smoothstep(-0.15, 0.55, facing) * tw * smoothstep(0.03, 0.35, z);
    gl_PointSize = min(uSize * uPR * (0.7 + aSeed * 0.6) * (1.0 + uDive * 0.8) / z, uPR * (3.2 + uDive * 3.0));
    gl_Position = projectionMatrix * mv;
  }`
const pointFS = /* glsl */ `
  varying float vAlpha;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.1, d) * vAlpha); }`
const rimVS = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`
const rimFS = /* glsl */ `
  uniform float uI; varying vec3 vN; varying vec3 vV;
  void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(vec3(1.0), f * uI); }`
const arcVS = /* glsl */ `
  attribute float aT; varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const arcFS = /* glsl */ `
  uniform float uHead, uTail; varying float vT;
  void main() { if (vT > uHead || vT < uTail) discard; gl_FragColor = vec4(vec3(1.0), 0.6 * smoothstep(uTail, uTail + 0.15, vT)); }`

/** Black & white land-dot globe (matches useopinion.io): white land points, fresnel rim, graticule, city rings, arcs. */
export function buildGlobe(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !PHONE, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50)
  const root = new THREE.Group()
  scene.add(root)
  const disposables: { dispose(): void }[] = [renderer]

  const coreGeo = new THREE.SphereGeometry(0.985, 64, 48)
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
  root.add(new THREE.Mesh(coreGeo, coreMat))
  const rimGeo = new THREE.SphereGeometry(1.012, 64, 48)
  const rimMat = new THREE.ShaderMaterial({ vertexShader: rimVS, fragmentShader: rimFS, uniforms: { uI: { value: 0.32 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  root.add(new THREE.Mesh(rimGeo, rimMat))
  const g: number[] = []
  for (let lon = -180; lon < 180; lon += 30)
    for (let lat = -90; lat < 90; lat += 3) {
      const a = toVec(lon, lat, 1.002)
      const b = toVec(lon, lat + 3, 1.002)
      g.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  for (let lat = -60; lat <= 60; lat += 30)
    for (let lon = -180; lon < 180; lon += 3) {
      const a = toVec(lon, lat, 1.002)
      const b = toVec(lon + 3, lat, 1.002)
      g.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  const gGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(g, 3))
  const gMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.055, depthWrite: false })
  root.add(new THREE.LineSegments(gGeo, gMat))
  disposables.push(coreGeo, coreMat, rimGeo, rimMat, gGeo, gMat)

  const pointsMat = new THREE.ShaderMaterial({
    vertexShader: pointVS,
    fragmentShader: pointFS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: PHONE ? 11 : 13 }, uPR: { value: renderer.getPixelRatio() }, uDive: { value: 0 } },
  })
  disposables.push(pointsMat)
  loadMask().then((mask) => {
    const { pos, seed } = landPoints(mask, PHONE ? 7000 : 14000)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    root.add(new THREE.Points(geo, pointsMat))
    disposables.push(geo)
  })

  // white city rings + dots
  const ringGeo = new THREE.RingGeometry(0.018, 0.026, 32)
  const dotGeo = new THREE.CircleGeometry(0.007, 16)
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  const pins: THREE.Mesh[] = []
  for (const c of CITIES) {
    const p = toVec(c.center[0], c.center[1], 1.006)
    const ring = new THREE.Mesh(ringGeo, pinMat.clone())
    ring.position.copy(p)
    ring.lookAt(p.clone().multiplyScalar(2))
    const dot = new THREE.Mesh(dotGeo, pinMat)
    dot.position.copy(p)
    dot.lookAt(p.clone().multiplyScalar(2))
    root.add(ring, dot)
    pins.push(ring)
    disposables.push(ring.material as THREE.Material)
  }
  disposables.push(ringGeo, dotGeo, pinMat)

  // one detailed Solana-coloured hex on London (where the dive lands), like useopinion.io
  {
    const purple = new THREE.Color('#9945FF')
    const green = new THREE.Color('#14F195')
    const hexPts = (r: number) => Array.from({ length: 6 }, (_, k) => new THREE.Vector3(r * Math.cos((Math.PI / 3) * k + Math.PI / 6), r * Math.sin((Math.PI / 3) * k + Math.PI / 6), 0))
    const tint = (geo: THREE.BufferGeometry, r: number) => {
      const pa = geo.getAttribute('position')
      const cols: number[] = []
      for (let k = 0; k < pa.count; k++) {
        const c = purple.clone().lerp(green, (pa.getX(k) / r + 1) / 2)
        cols.push(c.r, c.g, c.b)
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
      return geo
    }
    const R = 0.055
    const hex = new THREE.Group()
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
    const outer = tint(new THREE.BufferGeometry().setFromPoints(hexPts(R)), R)
    const innerH = tint(new THREE.BufferGeometry().setFromPoints(hexPts(R * 0.6)), R)
    const spokes = tint(new THREE.BufferGeometry().setFromPoints(hexPts(R).flatMap((v) => [v.clone().multiplyScalar(0.6), v])), R)
    const fillGeo = tint(new THREE.ShapeGeometry(new THREE.Shape(hexPts(R).map((v) => new THREE.Vector2(v.x, v.y)))), R)
    const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    hex.add(new THREE.LineLoop(outer, lineMat), new THREE.LineLoop(innerH, lineMat), new THREE.LineSegments(spokes, lineMat), new THREE.Mesh(fillGeo, fillMat))
    const hp = toVec(CITIES[0]!.center[0], CITIES[0]!.center[1], 1.008)
    hex.position.copy(hp)
    hex.lookAt(hp.clone().multiplyScalar(2))
    root.add(hex)
    disposables.push(lineMat, outer, innerH, spokes, fillGeo, fillMat)
  }

  // arcs between the cities, drawn in sequence
  const order = [0, 3, 4, 0, 1, 2]
  const arcs: THREE.ShaderMaterial[] = []
  for (let k = 0; k < order.length - 1; k++) {
    const A = CITIES[order[k]!]!
    const B = CITIES[order[k + 1]!]!
    const a = toVec(A.center[0], A.center[1], 1.006)
    const b = toVec(B.center[0], B.center[1], 1.006)
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(1 + a.distanceTo(b) * 0.42)
    const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(80)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, n) => n / 80), 1))
    const mat = new THREE.ShaderMaterial({ vertexShader: arcVS, fragmentShader: arcFS, transparent: true, depthWrite: false, uniforms: { uHead: { value: 0 }, uTail: { value: 0 } } })
    root.add(new THREE.Line(geo, mat))
    arcs.push(mat)
    disposables.push(geo, mat)
  }

  // spin so Europe / the Atlantic face us, with a slight tilt
  const ldn = toVec(CITIES[0]!.center[0], CITIES[0]!.center[1])
  const faceY = Math.atan2(-ldn.x, ldn.z)
  root.rotation.x = 0.35
  let spin = faceY - 0.9

  // like useopinion.io: rings are min(118vmin, 1180px); the globe's diameter is 0.6 of that, so it sits inside the inner ring
  const baseZ = () => {
    const w = canvas.clientWidth || innerWidth
    const h = canvas.clientHeight || innerHeight
    const ring = Math.min(1.18 * Math.min(w, h), 1180)
    return h / (0.6 * ring * Math.tan((35 / 2) * (Math.PI / 180)))
  }
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  addEventListener('resize', resize)

  const state = { dive: 0, speed: 1 }
  let raf = 0
  let last = performance.now()
  const t0 = last
  const frame = () => {
    raf = requestAnimationFrame(frame)
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    const t = (now - t0) / 1000
    pointsMat.uniforms.uTime!.value = t
    pointsMat.uniforms.uDive!.value = state.dive
    spin += dt * 0.08 * state.speed
    root.rotation.y = spin
    arcs.forEach((m, k) => {
      const head = Math.min(1, Math.max(0, (t - 0.9 - k * 0.45) * 0.9))
      m.uniforms.uHead!.value = head
      m.uniforms.uTail!.value = Math.max(0, head - 0.55 - Math.max(0, t - 6 - k * 0.45) * 0.4)
    })
    pins.forEach((r, k) => {
      const ph = (t * 0.7 + k * 0.23) % 1
      r.scale.setScalar(1 + ph * 1.6)
      ;(r.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - ph)
    })
    camera.position.z = baseZ() * (1 - state.dive * 0.74)
    camera.fov = 35 + state.dive * 30
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  }
  frame()
  return {
    state,
    dispose() {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
      disposables.forEach((d) => d.dispose())
    },
  }
}

