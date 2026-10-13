import { useStore } from '../store'
import { locate, startTracking, stopTracking } from '../hooks/useGeolocation'
import { toCell } from '../lib/h3'
import { fmtUsers, simCount, simZoom, simPoints, type SimSize } from '../lib/sim'
import { mapHandle } from '../map/Map3D'
import { km, fmtKm } from '../lib/format'
import { Icon } from './bits'
import { availableIn, CITY_COUNTRY } from '../lib/cards'

export default function MapControls() {
  const pos = useStore((s) => s.pos)
  const city = useStore((s) => s.city)
  const armed = useStore((s) => s.teleportArmed)
  const arm = useStore((s) => s.armTeleport)
  const flyTo = useStore((s) => s.flyTo)
  const toast = useStore((s) => s.toast)
  const showSignals = useStore((s) => s.showSignals)
  const toggleSignals = useStore((s) => s.toggleSignals)
  const panelOpen = useStore((s) => s.tab !== 'explore' || !!s.selectedCell)
  const worldView = useStore((s) => !s.entered) // from space: the globe + city picker own the screen
  // the mobile event strip sits above the dock → lift the controls over it (desktop unaffected)
  const stripUp = useStore((s) => s.tab === 'explore' && (s.homeFilter === 'event' || s.homeFilter === 'sport') && !s.selectedCell)
  const tallStrip = useStore((s) => s.homeFilter === 'sport')
  const tracking = useStore((s) => s.tracking)
  const geo = useStore((s) => s.geoStatus)
  const navOn = useStore((s) => !!s.nav)
  const sim = useStore((s) => s.sim)

  // 10k / 1M user simulation: tap to show, tap again to hide
  const toggleSim = (size: SimSize) => {
    const st = useStore.getState()
    if (st.sim === size) {
      st.setSim(null)
      return
    }
    st.setSim(size)
    const here = simPoints(city, size)
    toast(`Simulating ${fmtUsers(size)} users · ${city.name} ${fmtUsers(here.count)}${here.drawn < here.count ? ` (drawing ${fmtUsers(here.drawn)})` : ''}`, 'mint')
    // pull back so the whole town fits
    setTimeout(() => mapHandle.current?.easeTo({ center: city.center, zoom: Math.max(9.4, simZoom(city)), pitch: 35, bearing: 0, duration: 1600 }), 60)
  }

  // 📍 real device location: continuous GPS on / off
  const toggleLocation = async () => {
    if (tracking) {
      stopTracking()
      return toast('Location off')
    }
    const ok = await startTracking()
    const p = useStore.getState().pos
    if (ok && p) {
      toast('Location on · live GPS', 'mint')
      flyTo(p.lng, p.lat, 16.8)
    } else toast(useStore.getState().geoStatus === 'denied' ? 'Location blocked · allow it for this site in your browser settings' : 'Location unavailable on this device', 'ember')
  }
  // 📷 straight to the camera in the hex you're standing in
  const camera = async () => {
    let p = useStore.getState().pos
    if (!p) {
      await startTracking()
      p = useStore.getState().pos
    }
    if (!p) return toast('Turn on location (or Teleport) to capture a memory here', 'ember')
    const st = useStore.getState()
    st.setHexTab('memory')
    st.selectCell(toCell(p.lat, p.lng))
    st.requestCamera()
  }

  const centre = async () => {
    const cur = useStore.getState().pos
    if (cur) return flyTo(cur.lng, cur.lat, 16.6)
    const ok = await locate()
    const p = useStore.getState().pos
    if (ok && p) {
      const d = km(p.lat, p.lng, city.center[1], city.center[0])
      if (d > 25) toast(`You're ${fmtKm(d)} from ${city.name}. Teleport to speak here.`)
      flyTo(p.lng, p.lat, 16.6)
    } else {
      toast('Location unavailable · demo mode: tap Teleport, then the map', 'ember')
      arm(true)
    }
  }

  return (
    <div className={`pointer-events-auto absolute right-3 ${stripUp ? (tallStrip ? 'bottom-[calc(var(--dock-h)+136px)] lg:bottom-[calc(var(--dock-h)+12px)]' : 'bottom-[calc(var(--dock-h)+96px)] lg:bottom-[calc(var(--dock-h)+12px)]') : 'bottom-[calc(var(--dock-h)+12px)]'} z-20 flex-col items-end gap-2 md:right-4 ${worldView || navOn ? 'hidden' : `md:flex ${panelOpen ? 'hidden' : 'flex'}`}`}>
      {armed && <div className="glass rounded-xl px-3 py-2 text-[12px] text-ember">Tap anywhere to place yourself</div>}
      <div className="flex items-center gap-2">
        {([10_000, 1_000_000] as SimSize[]).map((n) => (
          <button
            key={n}
            onClick={() => toggleSim(n)}
            className={`btn-black grid h-9 min-w-9 place-items-center !rounded-xl !px-2 !py-0 font-mono text-[11px] font-semibold ${sim === n ? '!border-[#14f195]/70 !text-[#14f195] shadow-[0_0_18px_rgba(20,241,149,.25)]' : ''}`}
            aria-pressed={sim === n}
            aria-label={`Simulate ${n === 10_000 ? '10 thousand' : '1 million'} users`}
            title={`Simulate ${fmtUsers(n)} users across all cities`}
          >
            {fmtUsers(n)}
          </button>
        ))}
      </div>
      {sim && (
        <div className="-mt-1 rounded-lg bg-black/50 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.08em] text-[#14f195] uppercase">
          sim · {city.name} {fmtUsers(simCount(city.id, sim))} / {fmtUsers(sim)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={camera} className="btn-black grid h-11 w-11 place-items-center !rounded-2xl !p-0" aria-label="Capture a memory here" title="Memory · camera">
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>
        <button
          onClick={toggleLocation}
          className={`btn-black relative grid h-11 w-11 place-items-center !rounded-2xl !p-0 ${tracking ? '!border-[#14f195]/60 !text-[#14f195]' : ''}`}
          aria-pressed={tracking}
          aria-label={tracking ? 'Location on · tap to turn off' : 'Turn on location'}
          title={tracking ? 'Live GPS on' : 'Location off'}
        >
          <svg viewBox="0 0 24 24" className={`h-[19px] w-[19px] ${geo === 'asking' ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
            <circle cx="12" cy="10" r="2.4" fill={tracking ? 'currentColor' : 'none'} />
          </svg>
          {tracking && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#14f195] shadow-[0_0_8px_#14f195]" />}
        </button>
      </div>
      <button
          onClick={() => {
            const st = useStore.getState()
            st.setMarketTab('cards')
            st.setTab('market')
          }}
          className="btn-black flex h-11 items-center gap-2 !rounded-2xl !py-0 text-[12px]"
          aria-label="Crypto cards available here"
        >
          💳 {availableIn(CITY_COUNTRY[city.id].code).length || 'Check'} cards
        </button>
      <button
        onClick={() => {
          toggleSignals()
          toast(showSignals ? 'Traffic lights hidden' : 'Traffic lights on · zoom in to see them (phases simulated)')
        }}
        className={`btn-black flex h-11 items-center gap-2 !rounded-2xl !py-0 text-[12px] ${showSignals ? '' : 'opacity-50'}`}
        aria-pressed={showSignals}
        aria-label="Traffic lights"
        title="Traffic-light positions © OpenStreetMap · phases simulated (no live timing is published)"
      >
        🚦 {showSignals ? 'Lights on' : 'Lights off'}
      </button>
      <button
        onClick={() => arm(!armed)}
        className={`btn-black flex h-11 items-center gap-2 !rounded-2xl !py-0 text-[12px] ${armed ? '!border-white/50' : ''}`}
        aria-pressed={armed}
      >
        <Icon name="teleport" className="h-4 w-4" /> Teleport
      </button>
      <button onClick={centre} className="btn-black flex h-11 items-center gap-2 !rounded-2xl !py-0 text-[13px]">
        <Icon name="target" className="h-4 w-4" /> Centre
      </button>
      {pos && (
        <div className="text-[10px] tracking-[0.18em] text-fog uppercase">{pos.source === 'gps' ? 'GPS lock' : 'Teleported · demo'}</div>
      )}
    </div>
  )
}
