import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import * as THREE from 'three'
import { useStore } from '../store'
import { CITIES } from '../data/mock'
import { reduced } from './bits'

const PHONE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820
const MIN_MS = 3600 // the intro always gets this long…
const MAX_MS = 10000 // …and never waits longer than this for the map

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
function buildGlobe(canvas: HTMLCanvasElement) {
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

export default function Splash() {
  const done = useStore((s) => s.splashDone)
  const finish = useStore((s) => s.finishSplash)
  const ref = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem('opinion:splash') === '1'
      sessionStorage.setItem('opinion:splash', '1')
    } catch {
      /* storage blocked */
    }
    if (seen) {
      finish()
      return
    }
    const root = ref.current!
    let globe: ReturnType<typeof buildGlobe> | null = null
    try {
      if (!reduced()) globe = buildGlobe(canvas.current!)
    } catch {
      /* no WebGL for the intro → text only */
    }
    const q = gsap.utils.selector(root)
    const intro = gsap.timeline()
    if (!reduced()) {
      intro
        .from(canvas.current, { opacity: 0, scale: 0.7, duration: 2.2, ease: 'expo.out' }, 0)
        .from(q('.sp-rings-wrap'), { opacity: 0, scale: 0.86, rotate: -25, transformOrigin: '50% 50%', duration: 2.4, ease: 'expo.out' }, 0.1)
        .from(q('.sp-l'), { yPercent: 110, opacity: 0, filter: 'blur(12px)', duration: 1, ease: 'expo.out', stagger: 0.07 }, 0.3)
        // the ON tumbles in and spins three full turns before landing
        .fromTo(q('.sp-n'), { rotationY: -1080, rotationX: 40, yPercent: 120, opacity: 0, transformPerspective: 900 }, { rotationY: 0, rotationX: 0, yPercent: 0, opacity: 1, duration: 1.8, ease: 'expo.out' }, 0.6)
        .from(q('.sp-tag span'), { yPercent: 100, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.05 }, 1.2)
        .from(q('.sp-meta'), { opacity: 0, y: 10, duration: 0.8, ease: 'expo.out', stagger: 0.1 }, 1.6)
    }
    // the bar fills over MIN_MS, then waits for the map tiles + 3D city
    const t0 = performance.now()
    gsap.to(bar.current, { scaleX: 0.86, duration: MIN_MS / 1000, ease: 'power2.out' })
    let exiting = false
    const exit = () => {
      if (exiting) return
      exiting = true
      clearInterval(poll)
      gsap
        .timeline({ onComplete: finish })
        .to(bar.current, { scaleX: 1, duration: 0.3, ease: 'power2.out' })
        .to(q('.sp-text'), { y: -40, opacity: 0, filter: 'blur(14px)', duration: 0.8, ease: 'power3.in' }, 0.15)
        .to(globe?.state ?? {}, { dive: 1, speed: 6, duration: 1.4, ease: 'power3.in' }, 0.15)
        .to(canvas.current, { opacity: 0, scale: 1.6, duration: 1.2, ease: 'power3.in' }, 0.35)
        .to(q('.sp-rings-wrap'), { opacity: 0, scale: 3.2, transformOrigin: '50% 50%', duration: 0.9, ease: 'power2.in' }, 0.2)
        .to(root, { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 1.0)
    }
    const poll = setInterval(() => {
      const el = performance.now() - t0
      if ((el > MIN_MS && useStore.getState().mapReady) || el > MAX_MS) exit()
    }, 150)
    root.addEventListener('click', exit)
    return () => {
      clearInterval(poll)
      intro.kill()
      globe?.dispose()
    }
  }, [finish])

  if (done) return null
  const tagline = 'Share your own, help world, make friends, get rewarded'
  return (
    <div ref={ref} className="force-dark fixed inset-0 z-50 overflow-hidden bg-black" role="presentation">
      {/* HUD compass rings: same as useopinion.io (Solana gradient) */}
      <div aria-hidden className="sp-rings-wrap pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="-500 -500 1000 1000" className="sp-rings absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <defs>
          <linearGradient id="spSolRing" gradientUnits="userSpaceOnUse" x1="-480" y1="-480" x2="480" y2="480">
            <stop offset="0" stopColor="#9945FF" />
            <stop offset=".5" stopColor="#7A6BFF" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <g className="ring r1"><circle r="330" /><circle r="330" className="ticks" /></g>
        <g className="ring r2"><circle r="392" className="dash" /><path d="M -392 0 A 392 392 0 0 1 -277 -277" className="arc" /><path d="M 392 0 A 392 392 0 0 1 277 277" className="arc" /></g>
        <g className="ring r4"><circle className="faint" r="420" />
          <line x1="0.0" y1="-404.0" x2="0.0" y2="-420.0" /><line x1="70.4" y1="-399.5" x2="71.8" y2="-407.3" /><line x1="138.8" y1="-381.2" x2="141.5" y2="-388.7" /><line x1="202.0" y1="-349.9" x2="210.0" y2="-363.7" /><line x1="260.8" y1="-310.8" x2="265.9" y2="-316.8" /><line x1="310.8" y1="-260.8" x2="316.8" y2="-265.9" /><line x1="349.9" y1="-202.0" x2="363.7" y2="-210.0" /><line x1="381.2" y1="-138.8" x2="388.7" y2="-141.5" /><line x1="399.5" y1="-70.4" x2="407.3" y2="-71.8" /><line x1="404.0" y1="-0.0" x2="420.0" y2="-0.0" /><line x1="399.5" y1="70.4" x2="407.3" y2="71.8" /><line x1="381.2" y1="138.8" x2="388.7" y2="141.5" /><line x1="349.9" y1="202.0" x2="363.7" y2="210.0" /><line x1="310.8" y1="260.8" x2="316.8" y2="265.9" /><line x1="260.8" y1="310.8" x2="265.9" y2="316.8" /><line x1="202.0" y1="349.9" x2="210.0" y2="363.7" /><line x1="138.8" y1="381.2" x2="141.5" y2="388.7" /><line x1="70.4" y1="399.5" x2="71.8" y2="407.3" /><line x1="0.0" y1="404.0" x2="0.0" y2="420.0" /><line x1="-70.4" y1="399.5" x2="-71.8" y2="407.3" /><line x1="-138.8" y1="381.2" x2="-141.5" y2="388.7" /><line x1="-202.0" y1="349.9" x2="-210.0" y2="363.7" /><line x1="-260.8" y1="310.8" x2="-265.9" y2="316.8" /><line x1="-310.8" y1="260.8" x2="-316.8" y2="265.9" /><line x1="-349.9" y1="202.0" x2="-363.7" y2="210.0" /><line x1="-381.2" y1="138.8" x2="-388.7" y2="141.5" /><line x1="-399.5" y1="70.4" x2="-407.3" y2="71.8" /><line x1="-404.0" y1="0.0" x2="-420.0" y2="0.0" /><line x1="-399.5" y1="-70.4" x2="-407.3" y2="-71.8" /><line x1="-381.2" y1="-138.8" x2="-388.7" y2="-141.5" /><line x1="-349.9" y1="-202.0" x2="-363.7" y2="-210.0" /><line x1="-310.8" y1="-260.8" x2="-316.8" y2="-265.9" /><line x1="-260.8" y1="-310.8" x2="-265.9" y2="-316.8" /><line x1="-202.0" y1="-349.9" x2="-210.0" y2="-363.7" /><line x1="-138.8" y1="-381.2" x2="-141.5" y2="-388.7" /><line x1="-70.4" y1="-399.5" x2="-71.8" y2="-407.3" />
          <text className="cl-card" x="0.0" y="-440.0" transform="rotate(0 0.0 -440.0)">N</text><text className="cl-deg" x="220.0" y="-381.1" transform="rotate(30 220.0 -381.1)">030</text><text className="cl-deg" x="381.1" y="-220.0" transform="rotate(60 381.1 -220.0)">060</text><text className="cl-card" x="440.0" y="-0.0" transform="rotate(90 440.0 -0.0)">E</text><text className="cl-deg" x="381.1" y="220.0" transform="rotate(120 381.1 220.0)">120</text><text className="cl-deg" x="220.0" y="381.1" transform="rotate(150 220.0 381.1)">150</text><text className="cl-card" x="0.0" y="440.0" transform="rotate(180 0.0 440.0)">S</text><text className="cl-deg" x="-220.0" y="381.1" transform="rotate(210 -220.0 381.1)">210</text><text className="cl-deg" x="-381.1" y="220.0" transform="rotate(240 -381.1 220.0)">240</text><text className="cl-card" x="-440.0" y="0.0" transform="rotate(270 -440.0 0.0)">W</text><text className="cl-deg" x="-381.1" y="-220.0" transform="rotate(300 -381.1 -220.0)">300</text><text className="cl-deg" x="-220.0" y="-381.1" transform="rotate(330 -220.0 -381.1)">330</text>
        </g>
        <g className="ring r3"><circle r="460" className="ticks fine" /><circle className="faint" r="472" /><path d="M 460 0 A 460 460 0 0 1 325 325" className="arc" /><path d="M -460 0 A 460 460 0 0 1 -325 -325" className="arc" /></g>
        <g><line x1="-490" y1="0" x2="-440" y2="0" /><line x1="440" y1="0" x2="490" y2="0" /><line x1="0" y1="-490" x2="0" y2="-440" /><line x1="0" y1="440" x2="0" y2="490" /></g>
      </svg>
      </div>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <div className="sp-text pointer-events-none relative flex h-full flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display flex justify-center text-[15vw] leading-[0.9] font-bold tracking-[-0.06em] text-white [text-shadow:0_0_50px_rgba(0,0,0,.9)] md:text-[150px]">
          {'OPINI'.split('').map((l, i) => (
            <span key={i} className="sp-l inline-block">
              {l}
            </span>
          ))}
          <span className="sp-n inline-block">ON</span>
        </h1>
        <p className="sp-tag mt-5 flex max-w-[640px] flex-wrap justify-center gap-x-[0.3em] overflow-hidden text-[18px] leading-snug font-medium text-white/90 [text-shadow:0_0_24px_#000] md:text-[26px]">
          {tagline.split(' ').map((w, i) => (
            <span key={i} className="inline-block">
              {w}
            </span>
          ))}
        </p>
        <div className="sp-meta mt-10 w-[220px]">
          <div className="h-px w-full overflow-hidden bg-white/10">
            <div ref={bar} className="h-full origin-left scale-x-0 bg-white" />
          </div>
          <div className="mt-2.5 font-mono text-[10px] tracking-[0.28em] text-white/45 uppercase">Loading the world</div>
        </div>
      </div>
    </div>
  )
}
