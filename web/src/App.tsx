import { lazy, Suspense } from 'react'
import { useStore } from './store'
import { useGeolocation } from './hooks/useGeolocation'
import { useMockRealtime } from './hooks/useMockRealtime'
import { useEventFeeds } from './hooks/useEventFeeds'
import { useSportsFeed } from './hooks/useSportsFeed'
import { useTheme } from './hooks/useTheme'
import { useEarn } from './hooks/useEarn'
import EarnSheet, { BusyPrompt } from './components/EarnSheet'
import Map3D from './map/Map3D'
import Splash from './components/Splash'
import TopBar from './components/TopBar'
import Dock from './components/Dock'
import MapControls from './components/MapControls'
import Toasts from './components/Toasts'
import FeedRail from './components/FeedRail'
import HexSheet from './components/HexSheet'
import HomeTabs from './components/HomeTabs'
import { EventStrip } from './components/EventList'
import { SportsStrip } from './components/SportsList'
import AuthModal from './components/AuthModal'
import CityPicker from './components/CityPicker'
import ZoomRail from './components/ZoomRail'
import NavHUD from './components/NavHUD'
import NavSearch from './components/NavSearch'
import ProfileCard from './components/Profile'
import { useAuthBoot } from './hooks/useAuthBoot'
import LiteMode, { hasWebGL2 } from './components/LiteMode'

const WEBGL = hasWebGL2()

const EventsPanel = lazy(() => import('./components/EventsPanel'))
const CrewsPanel = lazy(() => import('./components/CrewsPanel'))
const MarketPanel = lazy(() => import('./components/MarketPanel'))
const RewardsPanel = lazy(() => import('./components/RewardsPanel'))
const AccountPanel = lazy(() => import('./components/AccountPanel'))
const ChatPanel = lazy(() => import('./components/ChatPanel'))

export default function App() {
  useGeolocation()
  useMockRealtime()
  useEventFeeds()
  useSportsFeed()
  useTheme()
  useEarn()
  useAuthBoot()
  const tab = useStore((s) => s.tab)
  const cell = useStore((s) => s.selectedCell)
  const crewId = useStore((s) => s.crewEventId)
  const homeFilter = useStore((s) => s.homeFilter)
  const navOn = useStore((s) => !!s.nav)

  if (!WEBGL)
    return (
      <>
        <LiteMode />
        <Toasts />
      </>
    )

  return (
    <main className="relative h-full w-full overflow-hidden bg-black">
      <Map3D />
      {/* vignette: the city dissolves into black at the edges */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgba(0,0,0,.85))]" />
      <div className="pointer-events-none absolute inset-0 z-10">
        <TopBar />
        {tab === 'explore' && !navOn && <HomeTabs />}
        {tab === 'explore' && <FeedRail />}
        {tab === 'explore' && homeFilter === 'event' && !cell && !navOn && <EventStrip />}
        {tab === 'explore' && homeFilter === 'sport' && !cell && !navOn && <SportsStrip />}
        {tab === 'explore' && cell && <HexSheet key={cell} />}
        <Suspense fallback={null}>
          {tab === 'events' && <EventsPanel />}
          {tab === 'crews' && <CrewsPanel key={crewId ?? 'list'} />}
          {tab === 'market' && <MarketPanel />}
          {tab === 'chat' && <ChatPanel />}
          {tab === 'rewards' && <RewardsPanel />}
          {tab === 'account' && <AccountPanel />}
        </Suspense>
        <ZoomRail />
        {!navOn && <BusyPrompt />}
        {tab === 'explore' && !cell && <NavHUD />}
        <MapControls />
        <Dock />
      </div>
      <Toasts />
      <CityPicker />
      <EarnSheet />
      <NavSearch />
      <ProfileCard />
      <AuthModal />
      <Splash />
    </main>
  )
}
