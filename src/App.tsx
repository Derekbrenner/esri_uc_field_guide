import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useLiveLocations } from './lib/useLiveLocations'
import { useCheckins, useMeetups, usePhotos, useSpots, useSquads, useVotes } from './lib/useSocial'
import Hero from './components/Hero'
import MapView, { type MapFocus } from './components/MapView'
import FoodView from './components/FoodView'
import PicturesView from './components/PicturesView'
import ScheduleView from './components/ScheduleView'
import CrewView from './components/CrewView'
import ScoresView from './components/ScoresView'
import SquadPanel from './components/SquadPanel'
import Toasts from './components/Toasts'
import { venues, venueKey } from './data/venues'
import { CalendarIcon, CameraIcon, CompassIcon, CrewIcon, CupIcon, PinIcon, TrophyIcon } from './components/icons'

const TABS = ['Guide', 'Map', 'Food & Drink', 'Pictures', 'Schedule', 'Crew', 'Scores'] as const
export type Tab = (typeof TABS)[number]

// Short labels + icons for the mobile bottom bar.
const TAB_META: Record<Tab, { short: string; Icon: ComponentType<{ className?: string }> }> = {
  Guide: { short: 'Guide', Icon: CompassIcon },
  Map: { short: 'Map', Icon: PinIcon },
  'Food & Drink': { short: 'Food', Icon: CupIcon },
  Pictures: { short: 'Pics', Icon: CameraIcon },
  Schedule: { short: 'Plan', Icon: CalendarIcon },
  Crew: { short: 'Crew', Icon: CrewIcon },
  Scores: { short: 'Scores', Icon: TrophyIcon },
}

// Social-only tabs: hidden entirely when Supabase isn't configured.
const SOCIAL_TABS: Tab[] = ['Pictures', 'Scores']

export default function App() {
  const [tab, setTab] = useState<Tab>('Guide')
  // Where the map should fly when arriving via a "Show on map" jump.
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null)
  const live = useLiveLocations()
  // Shared across the map + food views so the subscription persists across tabs.
  const votes = useVotes()
  // Shared check-in + photo streams: the map (presence + check-in + photos), the
  // Pictures grid, the Scores leaderboard, and the toast feed all read from one
  // realtime subscription each.
  const checkins = useCheckins()
  const photos = usePhotos()
  // User-added spots (Phase 5): shared so the map + food list agree and the
  // realtime subscription persists as the user switches tabs.
  const spots = useSpots()
  // Squads (Phase 6): shared across the map legend, the Scores board, the squad
  // panel, and the join toasts — one subscription for the whole app.
  const squads = useSquads()
  // Meetups (Phase 7): shared by the map (pins + banner + create) and the
  // creation toasts — one realtime subscription each for meetups + RSVPs.
  const meetups = useMeetups()
  // The squad create/join sheet, opened from the Map legend or the Scores tab.
  const [squadsOpen, setSquadsOpen] = useState(false)

  // Pictures + Scores are social features — hidden when Supabase isn't configured.
  const tabs = useMemo<Tab[]>(
    () => (live.configured ? [...TABS] : TABS.filter((t) => !SOCIAL_TABS.includes(t))),
    [live.configured],
  )

  // Let the map deep-link via hash (#map) so "Live map" buttons can jump there.
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.replace('#', '')) as Tab
      if (tabs.includes(h)) setTab(h)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [tabs])

  const go = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${encodeURIComponent(t)}`)
    window.scrollTo({ top: 0 })
  }

  // Jump to the map and fly to a location (used by the Pictures lightbox).
  const showOnMap = (lat: number, lng: number) => {
    setMapFocus({ lat, lng, at: Date.now() })
    go('Map')
  }

  // Resolve a schedule item's linked spot_key ('venue:<slug>' or a user-spot
  // uuid) to coordinates, then fly the map there. Used by the Schedule tab.
  const showSpotOnMap = (spotKey: string) => {
    if (spotKey.startsWith('venue:')) {
      const v = venues.find((vv) => venueKey(vv) === spotKey)
      if (v) showOnMap(v.lat, v.lng)
      return
    }
    const s = spots.spots.find((sp) => sp.id === spotKey)
    if (s && s.lat != null && s.lng != null) showOnMap(s.lat, s.lng)
  }

  const liveCount = live.others.length + (live.me ? 1 : 0)
  const showBadge = live.configured && liveCount > 0

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <button className="brand" onClick={() => go('Guide')} aria-label="Home">
          <span className="brand-pin" aria-hidden>◈</span>
          <span className="brand-text">
            <span className="brand-title">SD Field Guide</span>
            <span className="brand-sub">ESRI UC 2026</span>
          </span>
        </button>
        <nav className="tabs" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t}
              className={`tab${tab === t ? ' tab--active' : ''}`}
              onClick={() => go(t)}
              aria-current={tab === t ? 'page' : undefined}
            >
              {t}
              {t === 'Map' && showBadge && (
                <span className="tab-badge" title={`${liveCount} sharing now`}>{liveCount}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main id="main" className="main">
        {tab === 'Guide' && <Hero onNav={go} live={live} />}
        {tab === 'Map' && (
          <MapView
            live={live}
            votes={votes}
            checkins={checkins}
            photos={photos}
            spots={spots}
            squads={squads}
            meetups={meetups}
            focus={mapFocus}
            onFocusConsumed={() => setMapFocus(null)}
            onOpenSquads={() => setSquadsOpen(true)}
          />
        )}
        {tab === 'Food & Drink' && <FoodView onNav={go} live={live} votes={votes} spots={spots} />}
        {tab === 'Pictures' && <PicturesView photos={photos} live={live} onShowOnMap={showOnMap} />}
        {tab === 'Schedule' && (
          <ScheduleView live={live} onShowSpot={showSpotOnMap} userSpots={spots.spots} />
        )}
        {tab === 'Crew' && <CrewView live={live} />}
        {tab === 'Scores' && (
          <ScoresView
            checkins={checkins.checkins}
            photos={photos.photos}
            myId={live.myId}
            squads={squads}
            onManageSquads={() => setSquadsOpen(true)}
          />
        )}
      </main>

      <footer className="footer">
        <span className="mono">32.7065° N, 117.1610° W</span>
        <span>San Diego Convention Center · The crew’s field guide to Esri UC 2026</span>
      </footer>

      {/* Thumb-reachable bottom nav — mobile only (CSS-gated). */}
      <nav className="botnav" aria-label="Sections" style={{ ['--tabcount' as string]: tabs.length }}>
        {tabs.map((t) => {
          const { short, Icon } = TAB_META[t]
          const isMap = t === 'Map'
          return (
            <button
              key={t}
              className={`botnav-item${tab === t ? ' botnav-item--active' : ''}`}
              onClick={() => go(t)}
              aria-current={tab === t ? 'page' : undefined}
            >
              <span className="botnav-ico">
                <Icon />
                {isMap && showBadge && <span className="botnav-badge">{liveCount}</span>}
              </span>
              <span className="botnav-label">{short}</span>
            </button>
          )
        })}
      </nav>

      {live.configured && (
        <Toasts
          checkins={checkins.checkins}
          members={squads.members}
          squads={squads.squads}
          meetups={meetups.meetups}
          myId={live.myId}
        />
      )}

      {squads.configured && (
        <SquadPanel
          open={squadsOpen}
          onClose={() => setSquadsOpen(false)}
          squads={squads}
          live={live}
        />
      )}
    </div>
  )
}
