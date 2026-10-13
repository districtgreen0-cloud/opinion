import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * Real device location. "Location on" = continuous high-accuracy GPS (watchPosition) until switched off.
 * A teleport (demo) is replaced by the first real fix while tracking is on.
 */
let watch: number | null = null
let lastHead = 0

// ── which way you face: device compass (iOS webkitCompassHeading / absolute alpha), else GPS course while moving
function onOrient(e: DeviceOrientationEvent) {
  const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
  const h = typeof ios === 'number' ? ios : e.absolute && e.alpha !== null ? (360 - e.alpha) % 360 : null
  const now = performance.now()
  if (h === null || now - lastHead < 80) return
  lastHead = now
  useStore.getState().setHeading(Math.round(h))
}
function startCompass() {
  // iOS 13+: must be asked from the tap that turned location on (we are still inside that gesture here)
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined
  const listen = () => {
    window.addEventListener('deviceorientationabsolute' as 'deviceorientation', onOrient)
    window.addEventListener('deviceorientation', onOrient)
  }
  if (!D) return
  listen() // harmless if the sensor stays silent
  D.requestPermission?.().catch(() => {}) // iOS: shows the Motion & Orientation prompt
}
function stopCompass() {
  window.removeEventListener('deviceorientationabsolute' as 'deviceorientation', onOrient)
  window.removeEventListener('deviceorientation', onOrient)
  useStore.getState().setHeading(null)
}

export function startTracking(): Promise<boolean> {
  const s = useStore.getState()
  if (!('geolocation' in navigator)) {
    s.setGeoStatus('unavailable')
    return Promise.resolve(false)
  }
  if (watch !== null) return Promise.resolve(!!s.pos)
  startCompass()
  s.setGeoStatus('asking')
  return new Promise((resolve) => {
    let first = true
    watch = navigator.geolocation.watchPosition(
      (p) => {
        const st = useStore.getState()
        if (st.nav?.simulate) return // the ride simulator is driving the dot
        st.setGeoStatus('granted')
        st.setGeoAcc(Math.round(p.coords.accuracy))
        st.setPos({ lat: p.coords.latitude, lng: p.coords.longitude, source: 'gps' })
        // no compass sensor (desktop / Android without absolute orientation): use the GPS course while moving
        if (p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.8 && performance.now() - lastHead > 3000) st.setHeading(Math.round(p.coords.heading))
        if (first) {
          first = false
          st.setTracking(true)
          resolve(true)
        }
      },
      (err) => {
        const st = useStore.getState()
        st.setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
        if (first) {
          first = false
          stopTracking()
          resolve(false)
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
  })
}

export function stopTracking() {
  if (watch !== null) navigator.geolocation.clearWatch(watch)
  watch = null
  stopCompass()
  const s = useStore.getState()
  s.setTracking(false)
  s.setGeoAcc(null)
  if (s.pos?.source === 'gps') s.setPos(null)
}

/** One-shot locate (kept for older call sites): turns tracking on. */
export const locate = startTracking

/** Resume tracking on load if the user left it on and the browser still has permission. */
export function useGeolocation() {
  useEffect(() => {
    if (!useStore.getState().tracking) return
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((st) => {
        if (st.state === 'granted') void startTracking()
        else useStore.getState().setTracking(false)
      })
      .catch(() => {})
  }, [])
}
