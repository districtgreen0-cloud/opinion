import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * Real device location. "Location on" = continuous GPS (watchPosition) until switched off.
 * First fix: high accuracy; if that times out or is unavailable (indoors, laptops without GPS) we fall back to
 * network/Wi-Fi accuracy instead of giving up. Every failure leaves a human reason in store.geoError.
 */
let watch: number | null = null
let lastHead = 0

export const SECURE = typeof window === 'undefined' || window.isSecureContext

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
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined
  if (!D) return
  window.addEventListener('deviceorientationabsolute' as 'deviceorientation', onOrient)
  window.addEventListener('deviceorientation', onOrient)
  D.requestPermission?.().catch(() => {}) // iOS: Motion & Orientation prompt (must be inside the tap)
}
function stopCompass() {
  window.removeEventListener('deviceorientationabsolute' as 'deviceorientation', onOrient)
  window.removeEventListener('deviceorientation', onOrient)
  useStore.getState().setHeading(null)
}

const IS_IOS = /iPhone|iPad/.test(navigator.userAgent)
const IS_MAC = /Macintosh/.test(navigator.userAgent) && !IS_IOS
const IS_ANDROID = /Android/.test(navigator.userAgent)

/** Plain-language reason + what to do, per platform. */
export function geoReason(code: number | 'insecure' | 'unsupported'): string {
  if (code === 'insecure') return 'Location only works on a secure (https) page.'
  if (code === 'unsupported') return "This browser can't share your location."
  if (code === 1) {
    if (IS_IOS) return 'Location is blocked. iPhone: Settings → Privacy & Security → Location Services → your browser → "While Using", then reload.'
    if (IS_ANDROID) return 'Location is blocked. Android: tap the lock icon in the address bar → Permissions → Location → Allow.'
    if (IS_MAC) return 'Location is blocked. Mac: System Settings → Privacy & Security → Location Services → enable your browser, and allow it in the browser\'s site settings (lock icon).'
    return 'Location is blocked for this site. Allow it in the browser\'s site settings (lock icon in the address bar).'
  }
  if (code === 3) return "Couldn't get a fix in time. Try near a window or outdoors, or turn Wi-Fi on (it helps positioning)."
  return IS_MAC ? 'Position unavailable. Mac: System Settings → Privacy & Security → Location Services must be on, and Wi-Fi on.' : 'Position unavailable right now. Turn on Location Services / GPS and try again.'
}

function onFix(p: GeolocationPosition, first: { v: boolean }, resolve: (ok: boolean) => void) {
  const st = useStore.getState()
  if (st.nav?.simulate) return // the ride simulator is driving the dot
  st.setGeoStatus('granted')
  st.setGeoError(null)
  st.setGeoAcc(Math.round(p.coords.accuracy))
  st.setGeoSpeed(p.coords.speed !== null && !Number.isNaN(p.coords.speed) ? p.coords.speed : null)
  st.setPos({ lat: p.coords.latitude, lng: p.coords.longitude, source: 'gps' })
  if (p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.8 && performance.now() - lastHead > 3000) st.setHeading(Math.round(p.coords.heading))
  if (first.v) {
    first.v = false
    st.setTracking(true)
    resolve(true)
  }
}

export function startTracking(): Promise<boolean> {
  const s = useStore.getState()
  if (!SECURE) {
    s.setGeoStatus('unavailable')
    s.setGeoError(geoReason('insecure'))
    return Promise.resolve(false)
  }
  if (!('geolocation' in navigator)) {
    s.setGeoStatus('unavailable')
    s.setGeoError(geoReason('unsupported'))
    return Promise.resolve(false)
  }
  if (watch !== null) return Promise.resolve(!!s.pos)
  startCompass()
  s.setGeoStatus('asking')
  s.setGeoError(null)
  return new Promise((resolve) => {
    const first = { v: true }
    const fail = (err: GeolocationPositionError) => {
      const st = useStore.getState()
      st.setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      st.setGeoError(geoReason(err.code))
      if (first.v) {
        first.v = false
        stopTracking()
        resolve(false)
      }
    }
    const lowAccuracy = () => {
      // GPS didn't answer: keep watching with network positioning (Wi-Fi / cell), which laptops and indoor phones can do
      if (watch !== null) navigator.geolocation.clearWatch(watch)
      watch = navigator.geolocation.watchPosition((p) => onFix(p, first, resolve), fail, { enableHighAccuracy: false, maximumAge: 30000, timeout: 25000 })
    }
    watch = navigator.geolocation.watchPosition(
      (p) => onFix(p, first, resolve),
      (err) => (err.code === err.PERMISSION_DENIED || !first.v ? fail(err) : lowAccuracy()),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
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
  s.setGeoSpeed(null)
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
