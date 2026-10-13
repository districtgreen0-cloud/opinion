import * as THREE from 'three'

/**
 * "You are here": a light, transparent ground compass (three.js, metres) with a red location dot.
 * Designed in the XY plane (+Y = north), laid flat by the group's -90° X rotation.
 */
export type CompassHandle = {
  group: THREE.Group
  tick: (t: number, zoom: number) => void
  setHeading: (deg: number | null) => void
  setLight: (light: boolean) => void
  /** on an active hex: red → purple */
  setActive: (on: boolean) => void
  dispose: () => void
}

const RED = new THREE.Color('#ff3b30')
const PURPLE = new THREE.Color('#9945ff')
const SIZE = 0.53 // 47% smaller than the original design

const fadeFrag = /* glsl */ `
  uniform vec3 uC; uniform float uA; varying vec2 vUv;
  void main(){ float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard; gl_FragColor = vec4(uC, uA * smoothstep(1.0, 0.15, r)); }`
const wedgeFrag = /* glsl */ `
  uniform vec3 uC; uniform float uA; varying vec2 vUv;
  void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(uC, uA * (1.0 - r) * smoothstep(0.0, 0.15, r)); }`
const uvVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

export function buildCompass(): CompassHandle {
  const root = new THREE.Group()
  const flat = new THREE.Group()
  flat.rotation.x = -Math.PI / 2
  root.add(flat)
  const common = { transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide } as const
  const inkMats: (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[] = []
  const ink = (opacity: number) => {
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', opacity, ...common })
    inkMats.push(m)
    return m
  }

  // faint glass base
  const baseMat = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: fadeFrag, uniforms: { uC: { value: new THREE.Color('#ffffff') }, uA: { value: 0.07 } }, ...common })
  const base = new THREE.Mesh(new THREE.CircleGeometry(40, 96), baseMat)
  flat.add(base)

  // rings
  const outer = new THREE.Mesh(new THREE.RingGeometry(37.6, 38.2, 160), ink(0.55))
  const inner = new THREE.Mesh(new THREE.RingGeometry(24.2, 24.5, 128), ink(0.28))
  flat.add(outer, inner)

  // ticks: every 5°, longer each 15°, longest at the cardinals
  const pts: number[] = []
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180
    const len = d % 90 === 0 ? 6 : d % 15 === 0 ? 3.6 : 1.8
    const r0 = 37.6 - len
    pts.push(Math.sin(a) * r0, Math.cos(a) * r0, 0, Math.sin(a) * 37.6, Math.cos(a) * 37.6, 0)
  }
  const tickGeo = new THREE.BufferGeometry()
  tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const tickMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, depthTest: false })
  inkMats.push(tickMat)
  flat.add(new THREE.LineSegments(tickGeo, tickMat))

  // red north arrow + small diamonds on E / S / W
  const n = new THREE.Shape()
  n.moveTo(0, 47)
  n.lineTo(-3.6, 39.2)
  n.lineTo(0, 41)
  n.lineTo(3.6, 39.2)
  n.closePath()
  const northMat = new THREE.MeshBasicMaterial({ color: RED.clone(), ...common, opacity: 0.95 })
  const north = new THREE.Mesh(new THREE.ShapeGeometry(n), northMat)
  flat.add(north)
  for (const d of [90, 180, 270]) {
    const a = (d * Math.PI) / 180
    const dm = new THREE.Mesh(new THREE.CircleGeometry(1.2, 4), ink(0.6))
    dm.position.set(Math.sin(a) * 41, Math.cos(a) * 41, 0)
    flat.add(dm)
  }

  // heading wedge (only when the device knows which way you face)
  const wedgeMat = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: wedgeFrag, uniforms: { uC: { value: new THREE.Color('#ffffff') }, uA: { value: 0.32 } }, ...common })
  const wedge = new THREE.Mesh(new THREE.CircleGeometry(34, 48, Math.PI / 2 - 0.42, 0.84), wedgeMat)
  wedge.visible = false
  flat.add(wedge)

  // the red location dot: glow, pulse, white rim, solid core
  const glowMat = new THREE.ShaderMaterial({ vertexShader: uvVert, fragmentShader: fadeFrag, uniforms: { uC: { value: RED.clone() }, uA: { value: 0.35 } }, ...common })
  const glow = new THREE.Mesh(new THREE.CircleGeometry(10, 48), glowMat)
  const pulseMat = new THREE.MeshBasicMaterial({ color: RED.clone(), ...common, opacity: 0.5 })
  const pulse = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.6, 64), pulseMat)
  const rim = new THREE.Mesh(new THREE.CircleGeometry(4.1, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', ...common, opacity: 1 }))
  const coreMat = new THREE.MeshBasicMaterial({ color: RED.clone(), ...common, opacity: 1 })
  const core = new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), coreMat)
  glow.position.z = 0.05
  pulse.position.z = 0.1
  rim.position.z = 0.15
  core.position.z = 0.2
  flat.add(glow, pulse, rim, core)
  root.renderOrder = 3
  root.traverse((o) => (o.renderOrder = 3))

  let heading: number | null = null
  let mix = 0 // 0 = red, 1 = purple (eased)
  let target = 0
  const tint = new THREE.Color()
  let shown = 0 // eased heading for smooth turns
  return {
    group: root,
    tick(t, zoom) {
      // keep it readable when zoomed out (metres → grow below z16.5), but never huge
      root.scale.setScalar(SIZE * Math.min(6, Math.max(1, 2 ** (16.6 - zoom))))
      if (Math.abs(target - mix) > 0.002) {
        mix += (target - mix) * 0.08
        tint.copy(RED).lerp(PURPLE, mix)
        coreMat.color.copy(tint)
        pulseMat.color.copy(tint)
        northMat.color.copy(tint)
        ;(glowMat.uniforms.uC!.value as THREE.Color).copy(tint)
      }
      const k = (t * 0.55) % 1
      pulse.scale.setScalar(1 + k * 2.6)
      pulseMat.opacity = 0.55 * (1 - k)
      outer.material.opacity = 0.45 + Math.sin(t * 1.2) * 0.08
      if (heading !== null) {
        const d = ((heading - shown + 540) % 360) - 180
        shown = (shown + d * 0.15 + 360) % 360
        wedge.rotation.z = (-shown * Math.PI) / 180
      }
    },
    setHeading(deg) {
      if (deg === null || !Number.isFinite(deg)) {
        heading = null
        wedge.visible = false
        return
      }
      if (heading === null) shown = deg
      heading = deg
      wedge.visible = true
    },
    setActive(on) {
      target = on ? 1 : 0
    },
    setLight(light) {
      const c = new THREE.Color(light ? '#20202c' : '#ffffff')
      inkMats.forEach((m) => m.color.copy(c))
      baseMat.uniforms.uC!.value.copy(c)
      baseMat.uniforms.uA!.value = light ? 0.06 : 0.07
      wedgeMat.uniforms.uC!.value.copy(light ? new THREE.Color('#ff3b30') : new THREE.Color('#ffffff'))
      wedgeMat.uniforms.uA!.value = light ? 0.22 : 0.32
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        ;(m.material as THREE.Material | undefined)?.dispose?.()
      })
    },
  }
}
