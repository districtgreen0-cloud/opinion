import * as THREE from 'three'
import gsap from 'gsap'

/* ───────────────────────── renderer / scene ───────────────────────── */
const W = 1920, H = 1080
const canvas = document.getElementById('gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H, false)
renderer.setClearColor(0x000000, 1)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.7
const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x000000, 0.00042)
const camera = new THREE.PerspectiveCamera(42, W / H, 0.5, 20000)
scene.add(new THREE.AmbientLight(0x9aa2c8, 1.3))
scene.add(new THREE.HemisphereLight(0x6f6fb0, 0x101018, 0.9))
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(300, 600, 200); scene.add(key)
const violet = new THREE.PointLight(0x9945ff, 4, 1600, 1.2); scene.add(violet)
const green = new THREE.PointLight(0x14f195, 3, 1200, 1.2); scene.add(green)

const PURPLE = new THREE.Color('#9945ff'), GREEN = new THREE.Color('#14f195'), CYAN = new THREE.Color('#00c2ff'), GOLD = new THREE.Color('#e7c88c')
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

/* ───────────────────────── hex-grid floor (shader) ───────────────────────── */
const floorMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uC1: { value: PURPLE }, uC2: { value: GREEN } },
  transparent: true, depthWrite: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uCam, uC1, uC2; varying vec3 vW;
    float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
    vec4 hexCoords(vec2 uv){ vec2 r = vec2(1.0, 1.732); vec2 h = r*0.5; vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h; vec2 gv = dot(a,a) < dot(b,b) ? a : b; float y = 0.5 - hexDist(gv); vec2 id = uv - gv; return vec4(gv, id); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vW.xz / 26.0;
      vec4 hc = hexCoords(uv);
      float y = 0.5 - hexDist(hc.xy);
      float line = smoothstep(0.035, 0.0, y);
      float h = hash(hc.zw);
      float live = step(0.93, h) * (0.5 + 0.5 * sin(uTime * 1.3 + h * 40.0));
      float d = distance(vW.xz, uCam.xz);
      float fade = exp(-d * 0.0022);
      vec3 col = mix(uC1, uC2, h) ;
      float a = (line * 0.42 + live * 0.22 * (1.0 - line)) * fade;
      gl_FragColor = vec4(col * (0.6 + live), a);
    }`,
})
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), floorMat)
floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; scene.add(floor)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshBasicMaterial({ color: 0x050508 }))
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.1; scene.add(ground)

/* ───────────────────────── glass city ───────────────────────── */
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.3, metalness: 0.3, transparent: true, opacity: 0.82, emissive: 0x141a30, emissiveIntensity: 0.6 })
const edgeMat = new THREE.LineBasicMaterial({ color: 0xaab2d8, transparent: true, opacity: 0.6 })
// keep streets, the band, the landmarks and the camera paths free of buildings
const AVOID = []
let ROAD_PTS = []
const clear = (p) => AVOID.some((z) => Math.hypot(p.x - z.x, p.z - z.z) < z.r) || ROAD_PTS.some((r) => Math.hypot(p.x - r.x, p.z - r.z) < 34)
function city(cx, cz, radius, count, seed, tall = 1) {
  const g = new THREE.Group(); const r = rng(seed)
  let placed = 0
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0)
  const inst = new THREE.InstancedMesh(boxGeo, bodyMat, count)
  const edges = new THREE.EdgesGeometry(boxGeo)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
  const edgeInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }), 0)
  const lineGroup = new THREE.Group()
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius
    const w = 10 + r() * 18, dep = 10 + r() * 18
    const hgt = (8 + Math.pow(r(), 2.6) * 120 * (1 - d / radius) + r() * 14) * tall
    p.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d); s.set(w, hgt, dep); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 0.3)
    if (clear(p)) { inst.setMatrixAt(i, m.compose(p, q, s.set(0.001, 0.001, 0.001))); continue }
    placed++
    inst.setMatrixAt(i, m.compose(p, q, s))
    if (i % 2 === 0) { const l = new THREE.LineSegments(edges, edgeMat); l.position.copy(p); l.scale.copy(s); l.quaternion.copy(q); lineGroup.add(l) }
  }
  g.add(inst, lineGroup)
  // a few "active" hex outlines on the ground
  const hexGeo = new THREE.RingGeometry(12.5, 13.5, 6)
  for (let i = 0; i < Math.floor(count / 12); i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius
    const col = r() > 0.5 ? PURPLE : GREEN
    const hx = new THREE.Mesh(hexGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
    hx.rotation.x = -Math.PI / 2; hx.rotation.z = Math.PI / 6; hx.position.set(cx + Math.cos(a) * d, 0.3, cz + Math.sin(a) * d); g.add(hx)
  }
  scene.add(g); return g
}
function landmark(x, z, w, h, d, color, beam = true) {
  const g = new THREE.Group()
  const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0)
  g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.2, emissive: color, emissiveIntensity: 0.25 })))
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })); g.add(l)
  // inner floors
  for (let i = 1; i < 4; i++) { const f = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 0.98, 0.1, d * 0.98)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })); f.position.y = (h / 4) * i; g.add(f) }
  if (beam) {
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(3, 9, 900, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    bm.position.y = 450; g.add(bm)
    const halo = new THREE.Mesh(new THREE.RingGeometry(w * 0.62, w * 0.8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.4; g.add(halo)
  }
  g.position.set(x, 0, z); scene.add(g); return g
}

// world layout (scene units): Belgrade at origin, London far north-west
const BGD = new THREE.Vector3(0, 0, 0)
const LDN = new THREE.Vector3(-1500, 0, -980)
const WIEN = new THREE.Vector3(-380, 0, -300), MUC = new THREE.Vector3(-700, 0, -420), PAR = new THREE.Vector3(-1200, 0, -700)
const station = landmark(30, 20, 120, 16, 34, GOLD) // 1884 Build Station (gold)
landmark(LDN.x + 40, LDN.z + 30, 150, 26, 60, GREEN) // Hacker House
landmark(LDN.x - 260, LDN.z - 160, 90, 38, 90, PURPLE) // Breakpoint (Olympia)
// a stadium ring in London for the Sports shot
const stadium = new THREE.Mesh(new THREE.CylinderGeometry(70, 76, 24, 48, 1, true), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
stadium.position.set(LDN.x + 330, 12, LDN.z + 220); scene.add(stadium)
scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(70, 76, 24, 48, 1, true)), new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.7 })).translateX(LDN.x + 330).translateY(12).translateZ(LDN.z + 220))

/* ───────────────────────── the road ───────────────────────── */
const road = new THREE.CatmullRomCurve3([
  new THREE.Vector3(150, 0, 90), new THREE.Vector3(60, 0, -140), new THREE.Vector3(-150, 0, -230), WIEN.clone().add(new THREE.Vector3(60, 0, 40)),
  new THREE.Vector3(-540, 0, -330), MUC.clone().add(new THREE.Vector3(30, 0, 50)), new THREE.Vector3(-900, 0, -520), new THREE.Vector3(-1050, 0, -640),
  PAR.clone().add(new THREE.Vector3(40, 0, 60)), new THREE.Vector3(-1350, 0, -820), new THREE.Vector3(-1440, 0, -900), LDN.clone().add(new THREE.Vector3(140, 0, 110)),
], false, 'catmullrom', 0.4)
ROAD_PTS = road.getPoints(400)
AVOID.push({ x: 90, z: 80, r: 190 }, { x: LDN.x + 40, z: LDN.z + 30, r: 190 }, { x: LDN.x - 260, z: LDN.z - 160, r: 150 }, { x: LDN.x + 330, z: LDN.z + 220, r: 150 })
city(0, 0, 420, 900, 11)
city(LDN.x, LDN.z, 480, 1100, 23, 1.15)
city(WIEN.x, WIEN.z, 120, 120, 31, 0.7); city(MUC.x, MUC.z, 110, 110, 41, 0.6); city(PAR.x, PAR.z, 150, 160, 51, 0.8)
{
  const pts = road.getPoints(600)
  const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0.6, p.z)))
  const cols = []; pts.forEach((_, i) => { const c = PURPLE.clone().lerp(GREEN, i / pts.length); cols.push(c.r, c.g, c.b) })
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })))
  // glow ribbon
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(road, 400, 3.5, 6, false), new THREE.MeshBasicMaterial({ color: 0x9945ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
  ribbon.position.y = 0.3; scene.add(ribbon)
  const wide = new THREE.Mesh(new THREE.TubeGeometry(road, 400, 12, 6, false), new THREE.MeshBasicMaterial({ color: 0x14f195, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }))
  wide.position.y = 0.2; scene.add(wide)
}

/* ───────────────────────── the Yugo ───────────────────────── */
function solanaDecal(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, size, size); g.addColorStop(0, '#9945ff'); g.addColorStop(1, '#14f195')
  x.fillStyle = g; x.beginPath(); const R = size * 0.42
  for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; x.lineTo(size / 2 + R * Math.cos(a), size / 2 + R * Math.sin(a)) }
  x.closePath(); x.fill()
  x.fillStyle = '#000'; x.beginPath(); x.arc(size / 2, size / 2, size * 0.18, 0, Math.PI * 2); x.fill()
  x.fillStyle = g; x.beginPath(); x.arc(size / 2, size / 2, size * 0.09, 0, Math.PI * 2); x.fill()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function yugo() {
  const g = new THREE.Group()
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f4, roughness: 0.25, metalness: 0.15, clearcoat: 1, transparent: true, opacity: 0.92 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.5 })
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3 })
  // body: the Yugo's boxy little hatchback
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.0, 1.55), paint); body.position.y = 0.9; g.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.78, 1.45), glassM); cabin.position.set(-0.25, 1.75, 0); g.add(cabin)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 1.5), paint); roof.position.set(-0.25, 2.16, 0); g.add(roof)
  const pillars = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.9, 0.78, 1.45)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); pillars.position.copy(cabin.position); g.add(pillars)
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.3, 1.0, 1.55)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })).translateY(0.9))
  // wheels
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 20); wg.rotateX(Math.PI / 2)
  const wheels = []
  for (const [x, z] of [[1.1, 0.78], [1.1, -0.78], [-1.1, 0.78], [-1.1, -0.78]]) { const w = new THREE.Mesh(wg, dark); w.position.set(x, 0.36, z); g.add(w); wheels.push(w); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfd3e0, metalness: 0.8, roughness: 0.3 })); cap.position.copy(w.position); g.add(cap) }
  // lights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6d0 }); const tl = new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  for (const z of [0.55, -0.55]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), hl); h.position.set(1.66, 0.95, z); g.add(h); const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.3), tl); t.position.set(-1.66, 0.95, z); g.add(t) }
  const beams = new THREE.Group()
  for (const z of [0.55, -0.55]) { const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); cone.rotation.z = Math.PI / 2; cone.position.set(8.5, 0.9, z); beams.add(cone) }
  g.add(beams)
  // Solana logo decals: roof + both doors
  const decal = solanaDecal(); const dm = new THREE.MeshBasicMaterial({ map: decal, transparent: true })
  const roofD = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), dm); roofD.rotation.x = -Math.PI / 2; roofD.position.set(-0.25, 2.21, 0); g.add(roofD)
  for (const s of [1, -1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), dm); d.rotation.y = s > 0 ? 0 : Math.PI; d.position.set(-0.1, 0.95, s * 0.79); g.add(d) }
  // plate
  const plate = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#000'; x.font = 'bold 40px JetBrains Mono, monospace'; x.textAlign = 'center'; x.fillText('BG 011-ON', 128, 46); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: plate })); pl.rotation.y = -Math.PI / 2; pl.position.set(-1.67, 0.62, 0); g.add(pl)
  g.scale.setScalar(4) // scene scale
  scene.add(g)
  return { group: g, wheels, beams }
}
const car = yugo()

/* ───────────────────────── the band (fictional trio: KOD 011) ───────────────────────── */
function figure(tint, instrument) {
  const g = new THREE.Group()
  const m = new THREE.MeshPhysicalMaterial({ color: tint, transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.2, emissive: tint, emissiveIntensity: 0.35 })
  const edge = (geo) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }))
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 6, 12), m); body.position.y = 1.15; g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), m); head.position.y = 2.15; g.add(head); g.add(edge(new THREE.SphereGeometry(0.34, 12, 8)).translateY(2.15))
  // visor / eyes
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff })); eye.position.set(0, 2.2, 0.3); g.add(eye)
  const armGeo = new THREE.CapsuleGeometry(0.11, 0.7, 4, 8)
  const armL = new THREE.Group(), armR = new THREE.Group()
  const aL = new THREE.Mesh(armGeo, m); aL.position.y = -0.4; armL.add(aL); armL.position.set(-0.55, 1.7, 0)
  const aR = new THREE.Mesh(armGeo, m); aR.position.y = -0.4; armR.add(aR); armR.position.set(0.55, 1.7, 0)
  g.add(armL, armR)
  const legGeo = new THREE.CapsuleGeometry(0.14, 0.6, 4, 8)
  for (const x of [-0.2, 0.2]) { const l = new THREE.Mesh(legGeo, m); l.position.set(x, 0.42, 0); g.add(l) }
  // instrument
  const inst = new THREE.Group()
  const im = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.4, metalness: 0.5 })
  const glow = new THREE.LineBasicMaterial({ color: tint })
  if (instrument === 'guitar') {
    const bodyG = new THREE.BoxGeometry(0.9, 0.5, 0.12), neck = new THREE.BoxGeometry(1.2, 0.1, 0.06)
    const b = new THREE.Mesh(bodyG, im); const n = new THREE.Mesh(neck, im); n.position.x = 0.95
    inst.add(b, n, new THREE.LineSegments(new THREE.EdgesGeometry(bodyG), glow), new THREE.LineSegments(new THREE.EdgesGeometry(neck), glow).translateX(0.95))
    inst.rotation.z = 0.35; inst.position.set(0.1, 1.2, 0.45)
  } else if (instrument === 'drums') {
    const dg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20)
    for (const [x, z] of [[-0.45, 0.7], [0.45, 0.7]]) { const d = new THREE.Mesh(dg, im); d.position.set(x, 0.9, z); inst.add(d, new THREE.LineSegments(new THREE.EdgesGeometry(dg), glow).translateX(x).translateY(0.9).translateZ(z)) }
    const kick = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24).rotateX(Math.PI / 2); const k = new THREE.Mesh(kick, im); k.position.set(0, 0.55, 1.05); inst.add(k, new THREE.LineSegments(new THREE.EdgesGeometry(kick), glow).translateY(0.55).translateZ(1.05))
    for (const x of [-0.5, 0.5]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff })); s.rotation.x = -0.9; s.position.set(x, 1.35, 0.3); armL.userData.stick = s; inst.add(s) }
  } else {
    const mic = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.3 })); mic.position.set(0.3, 2.05, 0.45)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7), im); stem.rotation.z = 0.6; stem.position.set(0.5, 1.75, 0.45); inst.add(mic, stem)
  }
  g.add(inst)
  g.userData = { armL, armR, inst, body, head, instrument }
  g.scale.setScalar(2.6)
  scene.add(g)
  return g
}
const band = [figure(PURPLE, 'guitar'), figure(GREEN, 'mic'), figure(CYAN, 'drums')]
const bandIdle = [new THREE.Vector3(120, 0, 112), new THREE.Vector3(128, 0, 118), new THREE.Vector3(112, 0, 120)] // beside the station, next to the car
band.forEach((f, i) => f.position.copy(bandIdle[i]))

// music notes
const noteTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.font = 'bold 100px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#14f195'; x.shadowBlur = 24; x.fillStyle = '#fff'; x.fillText('♪', 64, 70); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t })()
const notes = Array.from({ length: 14 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, opacity: 0, depthWrite: false })); s.scale.setScalar(4 + (i % 3)); scene.add(s); return s })

/* ───────────────────────── globe (intro) ───────────────────────── */
const globe = new THREE.Group(); globe.position.set(0, 6000, 0); scene.add(globe)
const GLOBE_R = 100
{
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 0.985, 64, 48), new THREE.MeshBasicMaterial({ color: 0x000000 })))
  const rim = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN, vV; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vN, vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(vec3(1.0), f*0.35); }` })
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.012, 64, 48), rim))
  const img = new Image(); img.src = '/earth-mask.png'
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const mask = x.getImageData(0, 0, c.width, c.height)
    const pos = []; const r = rng(5)
    let guard = 0
    while (pos.length < 16000 * 3 && guard++ < 1e6) {
      const z = r() * 2 - 1, lat = (Math.asin(z) * 180) / Math.PI, lon = r() * 360 - 180
      const u = Math.floor(((lon + 180) / 360) * (mask.width - 1)), v = Math.floor(((90 - lat) / 180) * (mask.height - 1))
      if (mask.data[(v * mask.width + u) * 4] > 128) continue
      const phi = ((90 - lat) * Math.PI) / 180, th = ((lon + 180) * Math.PI) / 180
      pos.push(-GLOBE_R * Math.sin(phi) * Math.cos(th), GLOBE_R * Math.cos(phi), GLOBE_R * Math.sin(phi) * Math.sin(th))
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    globe.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, transparent: true, opacity: 0.9, depthWrite: false })))
    window.__ready = true
  }
  // Belgrade → London arc + Solana hex on both
  const ll = (lat, lon, rr = GLOBE_R * 1.01) => { const phi = ((90 - lat) * Math.PI) / 180, th = ((lon + 180) * Math.PI) / 180; return new THREE.Vector3(-rr * Math.sin(phi) * Math.cos(th), rr * Math.cos(phi), rr * Math.sin(phi) * Math.sin(th)) }
  const a = ll(44.8, 20.46), b = ll(51.51, -0.12); const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_R * 1.25)
  const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(80)
  const geo = new THREE.BufferGeometry().setFromPoints(pts); const cols = []; pts.forEach((_, i) => { const c = PURPLE.clone().lerp(GREEN, i / 80); cols.push(c.r, c.g, c.b) }); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  globe.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })))
  for (const p of [a, b]) { const hx = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 6), new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide })); hx.position.copy(p); hx.lookAt(p.clone().multiplyScalar(2)); globe.add(hx) }
  globe.rotation.x = 0.35
}

/* ───────────────────────── state + timeline ───────────────────────── */
const S = {
  cam: { x: 0, y: 6000, z: 320, lx: 0, ly: 6000, lz: 0 }, // free camera (position + look-at)
  follow: 0, fo: { x: -26, y: 12, z: 30 }, // follow blend + offset (car-relative, rotated by heading)
  carT: 0, carBounce: 0, lights: 0, wheelSpin: 0,
  band: 0, // 0 = standing, 1 = inside car, 2 = on the roof playing
  play: 0, notes: 0, phoneArm: 0, flash: 0, globeSpin: 0,
}
const q = (id) => document.getElementById(id)
const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
const show = (el, at, dur = 0.6, hold = null) => { tl.to(el, { opacity: 1, duration: dur, ease: 'power2.out' }, at); if (hold !== null) tl.to(el, { opacity: 0, duration: 0.5, ease: 'power2.in' }, at + hold) }
const camTo = (at, dur, pos, look, ease = 'power2.inOut') => tl.to(S.cam, { x: pos[0], y: pos[1], z: pos[2], lx: look[0], ly: look[1], lz: look[2], duration: dur, ease }, at)
const camSet = (at, pos, look) => tl.set(S.cam, { x: pos[0], y: pos[1], z: pos[2], lx: look[0], ly: look[1], lz: look[2] }, at)

/* 0–7 · intro globe */
tl.set(S, { globeSpin: 0 }, 0)
tl.to(S, { globeSpin: 1, duration: 7 }, 0)
camTo(0, 7, [0, 6000, 330], [0, 6000, 0], 'power1.out'); tl.to(S.cam, { z: 300, duration: 7 }, 0)
tl.set('#fade', { opacity: 1 }, 0); tl.to('#fade', { opacity: 0, duration: 1.2 }, 0)
tl.from('#introTitle', { yPercent: 40, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0.3)
tl.fromTo('#introOn', { rotationY: -1080, opacity: 0 }, { rotationY: 0, opacity: 1, duration: 1.8, ease: 'expo.out' }, 0.5)
tl.from('#introTag', { y: 20, opacity: 0, duration: 1, ease: 'expo.out' }, 1.3)
tl.to('.rings', { rotation: 18, duration: 7 }, 0)
tl.to('#intro', { opacity: 0, scale: 1.25, duration: 0.8, ease: 'power3.in' }, 6.2)
tl.to('#fade', { opacity: 1, duration: 0.5 }, 6.5)

/* 7–18 · Belgrade drone */
camSet(7, [620, 760, 640], [60, 0, 40])
tl.to('#fade', { opacity: 0, duration: 1 }, 7)
camTo(7, 11, [300, 150, 330], [110, 8, 95], 'power2.out')
show('#cap1', 8.2, 0.8, 6.5)
tl.to(S, { lights: 0, duration: 0.1 }, 7)

/* 18–30 · the job in the app */
camTo(18, 3, [172, 13, 152], [122, 6, 115], 'power2.inOut')
tl.to(S, { phoneArm: 1, duration: 0.8, ease: 'power2.out' }, 19)
show('#phone', 19.4, 0.7)
show('#job', 20.4, 0.5)
show('#cap2', 20.2, 0.6, 3.8)
tl.to('#takeBtn', { scale: 0.92, duration: 0.12, yoyo: true, repeat: 1 }, 24.2)
tl.set('#stFunded', { className: 'on' }, 22.5); show('#toast1', 22.6, 0.4, 2.6)
tl.set('#stTaken', { className: 'on' }, 24.5); show('#toast2', 24.6, 0.4, 3)
tl.set('#takeBtn', { innerText: '✓ Taken · escrow locked' }, 24.5)
show('#cap3', 25, 0.6, 4.2)
tl.to('#phone', { opacity: 0, duration: 0.5 }, 29.2); tl.set('#job', { opacity: 0 }, 29.8)
tl.to(S, { phoneArm: 0, duration: 0.5 }, 29.2)

/* 30–38 · get in, lights on, drive off */
tl.to(S, { band: 1, duration: 1.2, ease: 'power2.inOut' }, 30)
tl.to(S, { lights: 1, duration: 0.6 }, 31.4)
camTo(30, 2.5, [200, 12, 130], [150, 5, 90], 'power2.inOut')
tl.to(S, { carT: 0.06, duration: 6, ease: 'power2.in' }, 32)
tl.to(S, { follow: 1, duration: 2, ease: 'power2.inOut' }, 33)
tl.set(S.fo, { x: -30, y: 11, z: 26 }, 30)

/* 38–70 · road trip (follow shots, roof performance, drone wide) */
tl.to(S, { carT: 0.42, duration: 22, ease: 'none' }, 38)
tl.to(S.fo, { x: -46, y: 20, z: 34, duration: 6, ease: 'sine.inOut' }, 38)
show('#cap4', 39, 0.8, 5)
// roof performance 44–53
tl.to(S, { band: 2, duration: 1.4, ease: 'back.out(1.4)' }, 44)
tl.to(S, { play: 1, duration: 0.6 }, 45); tl.to(S, { notes: 1, duration: 0.6 }, 45.5)
tl.to(S.fo, { x: 22, y: 9, z: 26, duration: 4, ease: 'sine.inOut' }, 44)
tl.to(S.fo, { x: -14, y: 7, z: -30, duration: 5, ease: 'sine.inOut' }, 49)
// drone wide 54–60: unfollow, high above the map
tl.to(S, { follow: 0, duration: 1.5, ease: 'power2.inOut' }, 54)
camSet(54, [-420, 380, 160], [-700, 0, -420]); camTo(54, 6, [-760, 700, 420], [-800, 0, -500], 'power1.inOut')
for (const c of document.querySelectorAll('.city')) show(c, 55, 0.6, 5)
tl.to(S, { notes: 0, duration: 1 }, 54); tl.to(S, { play: 0, duration: 1 }, 56); tl.to(S, { band: 1, duration: 1 }, 57)
// night chase 60–70
tl.to(S, { follow: 1, duration: 1.5, ease: 'power2.inOut' }, 60)
tl.set(S.fo, { x: -34, y: 9, z: 22 }, 60)
tl.to(S, { carT: 0.985, duration: 10, ease: 'power1.inOut' }, 60)
tl.to(S.fo, { x: 24, y: 14, z: 40, duration: 10, ease: 'sine.inOut' }, 60)

/* 70–88 · London: arrive, shoot the memory, get paid */
tl.to(S, { follow: 0, duration: 1.2, ease: 'power2.inOut' }, 70)
camSet(70, [LDN.x + 330, 120, LDN.z + 330], [LDN.x + 110, 12, LDN.z + 110]); camTo(70, 5, [LDN.x + 250, 50, LDN.z + 250], [LDN.x + 90, 14, LDN.z + 80], 'power2.out')
tl.to(S, { carT: 1, duration: 3, ease: 'power2.out' }, 70); tl.to(S, { lights: 0, duration: 0.5 }, 73.5)
tl.to(S, { band: 0, duration: 1.4, ease: 'power2.inOut' }, 73.5)
show('#cap5', 72, 0.8, 5.5)
camTo(75.5, 3, [LDN.x + 205, 14, LDN.z + 178], [LDN.x + 150, 6, LDN.z + 118], 'power2.inOut')
tl.to(S, { phoneArm: 1, duration: 0.8, ease: 'power2.out' }, 77)
tl.to(S, { flash: 1, duration: 0.08 }, 78.6); tl.to(S, { flash: 0, duration: 0.5 }, 78.7)
show('#mem', 79, 0.5, 3.6)
show('#phone', 83, 0.5); tl.set('#job', { opacity: 1 }, 83); tl.set('#memCard', { opacity: 1 }, 83)
tl.set('#stDeliv', { className: 'on' }, 83.6); show('#toast3', 83.7, 0.4, 2.2)
tl.set('#stPaid', { className: 'on' }, 85.2); tl.set('#takeBtn', { innerText: '✓ Paid · 180 USDC released' }, 85.2)
tl.fromTo('#paid', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.6)' }, 85.3)
tl.to('#paid', { opacity: 0, duration: 0.5 }, 88); tl.to('#phone', { opacity: 0, duration: 0.5 }, 88)
tl.to(S, { phoneArm: 0, duration: 0.4 }, 88)
tl.set('#memCard', { opacity: 0 }, 88.6); tl.set('#job', { opacity: 0 }, 88.6)

/* 88–108 · feature montage (hard cuts) */
const cut = (at, pos, look, pan, el) => { tl.set('#fade', { opacity: 1 }, at); tl.to('#fade', { opacity: 0, duration: 0.35 }, at); camSet(at, pos, look); camTo(at, 5, pan, look, 'power1.out'); show(el, at + 0.3, 0.6, 4) }
cut(88.6, [LDN.x - 60, 120, LDN.z + 80], [LDN.x - 240, 14, LDN.z - 150], [LDN.x - 120, 90, LDN.z + 20], '#f1')
cut(93.6, [LDN.x + 470, 90, LDN.z + 380], [LDN.x + 330, 10, LDN.z + 220], [LDN.x + 400, 60, LDN.z + 330], '#f2')
cut(98.6, [LDN.x + 215, 18, LDN.z + 190], [LDN.x + 150, 7, LDN.z + 120], [LDN.x + 190, 14, LDN.z + 165], '#f3')
cut(103.6, [LDN.x + 500, 300, LDN.z + 500], [LDN.x, 0, LDN.z], [LDN.x + 420, 260, LDN.z + 440], '#f4')
tl.to(S, { play: 1, duration: 0.5 }, 98.6); tl.to(S, { play: 0, duration: 0.5 }, 103.4)

/* 108–120 · outro */
tl.to('#fade', { opacity: 1, duration: 1.2 }, 108)
show('#cap6', 104.5, 0.8, 3.2)
tl.fromTo('#outro', { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 109.4)
tl.from('#outro img', { scale: 0.6, rotate: -40, duration: 1.4, ease: 'back.out(1.5)' }, 109.4)
tl.from('#outro h2', { y: 30, opacity: 0, duration: 1, ease: 'expo.out' }, 110)
tl.from('#outro p, #outro .url, #outro .sol-line', { y: 20, opacity: 0, duration: 0.9, stagger: 0.25, ease: 'expo.out' }, 110.6)
tl.to('#outro', { opacity: 0, duration: 1, ease: 'power2.in' }, 118.8)
tl.to({}, { duration: 0.1 }, 119.9)

const DURATION = 120
window.__duration = DURATION

/* ───────────────────────── per-frame world update ───────────────────────── */
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
const cityLabels = { bgd: BGD, wien: WIEN, muc: MUC, par: PAR, ldn: LDN }
function update(t) {
  floorMat.uniforms.uTime.value = t
  // globe
  globe.rotation.y = -0.9 + S.globeSpin * 0.9
  // car along the road
  const pos = road.getPointAt(Math.min(0.9999, S.carT)); const tan = road.getTangentAt(Math.min(0.9999, S.carT))
  const heading = Math.atan2(tan.x, tan.z)
  car.group.position.set(pos.x, 0.05 + Math.sin(t * 14) * 0.12 * (S.carT > 0 && S.carT < 1 ? 1 : 0), pos.z)
  car.group.rotation.y = heading - Math.PI / 2
  car.wheels.forEach((w) => (w.rotation.z = -t * 18))
  car.beams.visible = S.lights > 0.5
  // band placement: standing (0) ↔ in car (1) ↔ roof (2)
  const seatsLocal = [new THREE.Vector3(-0.6, 1.3, 0.45), new THREE.Vector3(0.4, 1.3, 0.45), new THREE.Vector3(-0.6, 1.3, -0.45)]
  const roofLocal = [new THREE.Vector3(-0.9, 2.2, 0.45), new THREE.Vector3(0.35, 2.2, -0.2), new THREE.Vector3(-1.1, 2.2, -0.45)]
  band.forEach((f, i) => {
    const standing = S.carT < 0.03 ? bandIdle[i] : tmp2.copy(car.group.position).add(new THREE.Vector3(Math.cos(heading) * (10 + i * 6), 0, -Math.sin(heading) * (10 + i * 6) + 14 * (i - 1)))
    const seat = car.group.localToWorld(seatsLocal[i].clone()), roof = car.group.localToWorld(roofLocal[i].clone())
    const b = S.band
    if (b <= 1) tmp.copy(standing).lerp(seat, b); else tmp.copy(seat).lerp(roof, b - 1)
    const inCar = b > 0.5 && b < 1.5
    f.position.copy(tmp)
    f.scale.setScalar(inCar ? 2.6 * (1 - (1 - Math.abs(b - 1)) * 0.65) : 2.6 * (b > 1.5 ? 0.9 : 1))
    f.rotation.y = b < 0.5 ? Math.atan2(camera.position.x - f.position.x, camera.position.z - f.position.z) : heading - Math.PI / 2 + Math.PI
    // bob / play
    const bob = Math.sin(t * 6 + i) * 0.04 * (1 + S.play * 3)
    f.userData.body.position.y = 1.15 + bob; f.userData.head.position.y = 2.15 + bob + Math.sin(t * 12 + i) * 0.03 * S.play
    const strum = Math.sin(t * 9 + i) * 0.5 * S.play
    f.userData.armR.rotation.z = -0.4 + strum * 0.6 - S.phoneArm * (i === 1 ? 1.6 : 0)
    f.userData.armL.rotation.z = 0.4 - strum * 0.6
    f.userData.armR.rotation.x = -S.phoneArm * (i === 1 ? 0.9 : 0)
    if (f.userData.instrument === 'drums') f.userData.inst.children.forEach((c) => c.userData && 0)
  })
  // notes
  notes.forEach((n, i) => {
    const ph = (t * 0.5 + i * 0.13) % 1
    const base = car.group.position
    n.position.set(base.x + Math.sin(i * 2.1 + t) * 10, 10 + ph * 26, base.z + Math.cos(i * 1.7 + t) * 10)
    n.material.opacity = S.notes * (1 - ph) * 0.9
  })
  // camera: free ↔ follow (car-relative offset rotated by heading)
  const fx = S.fo.x * Math.sin(heading) + S.fo.z * Math.cos(heading), fz = S.fo.x * Math.cos(heading) - S.fo.z * Math.sin(heading)
  const fpos = tmp.set(pos.x + fx, S.fo.y, pos.z + fz)
  const flook = tmp2.set(pos.x, 4, pos.z)
  camera.position.set(S.cam.x, S.cam.y, S.cam.z).lerp(fpos, S.follow)
  const look = new THREE.Vector3(S.cam.lx, S.cam.ly, S.cam.lz).lerp(flook, S.follow)
  camera.lookAt(look)
  camera.updateMatrixWorld(true)
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  // drone sway
  camera.position.y += Math.sin(t * 0.7) * 0.6 * S.follow
  floorMat.uniforms.uCam.value.copy(camera.position)
  violet.position.set(camera.position.x + 60, 80, camera.position.z - 40); green.position.set(car.group.position.x, 20, car.group.position.z)
  // station pulse
  station.children[0].material.emissiveIntensity = 0.25 + Math.sin(t * 2) * 0.1
  // city labels (project)
  for (const el of document.querySelectorAll('.city')) {
    const v = cityLabels[el.dataset.city].clone(); v.y = 30; v.project(camera)
    el.style.left = `${((v.x + 1) / 2) * W}px`; el.style.top = `${((1 - v.y) / 2) * H}px`
    el.style.visibility = v.z < 1 ? 'visible' : 'hidden'
  }
  q('flash').style.opacity = String(S.flash)
  renderer.render(scene, camera)
}

window.__seek = (t) => { tl.seek(t, false); update(t) }
// live preview (not used by the renderer): scrub with the mouse X
if (!navigator.webdriver) {
  let t = 0
  addEventListener('mousemove', (e) => (t = (e.clientX / innerWidth) * DURATION))
  const loop = () => { window.__seek(t); requestAnimationFrame(loop) }
  loop()
}
