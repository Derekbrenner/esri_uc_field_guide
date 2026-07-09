import { useEffect, useState, type ComponentType } from 'react'
import { useLiveLocations } from './lib/useLiveLocations'
import { useVotes } from './lib/useSocial'
import Hero from './components/Hero'
import MapView from './components/MapView'
import FoodView from './components/FoodView'
import ScheduleView from './components/ScheduleView'
import CrewView from './components/CrewView'
import { CalendarIcon, CompassIcon, CrewIcon, CupIcon, PinIcon } from './components/icons'

const TABS = ['Guide', 'Map', 'Food & Drink', 'Schedule', 'Crew'] as const
export type Tab = (typeof TABS)[number]

// Short labels + icons for the mobile bottom bar.
const TAB_META: Record<Tab, { short: string; Icon: ComponentType<{ className?: string }> }> = {
  Guide: { short: 'Guide', Icon: CompassIcon },
  Map: { short: 'Map', Icon: PinIcon },
  'Food & Drink': { short: 'Food', Icon: CupIcon },
  Schedule: { short: 'Plan', Icon: CalendarIcon },
  Crew: { short: 'Crew', Icon: CrewIcon },
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Guide')
  const live = useLiveLocations()
  // Shared across the map + food views so the subscription persists across tabs.
  const votes = useVotes()

  // Let the map deep-link via hash (#map) so "Live map" buttons can jump there.
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.replace('#', '')) as Tab
      if (TABS.includes(h)) setTab(h)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  const go = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${encodeURIComponent(t)}`)
    window.scrollTo({ top: 0 })
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
          {TABS.map((t) => (
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
        {tab === 'Map' && <MapView live={live} votes={votes} />}
        {tab === 'Food & Drink' && <FoodView onNav={go} live={live} votes={votes} />}
        {tab === 'Schedule' && <ScheduleView />}
        {tab === 'Crew' && <CrewView />}
      </main>

      <footer className="footer">
        <span className="mono">32.7065° N, 117.1610° W</span>
        <span>San Diego Convention Center · The crew’s field guide to Esri UC 2026</span>
      </footer>

      {/* Thumb-reachable bottom nav — mobile only (CSS-gated). */}
      <nav className="botnav" aria-label="Sections">
        {TABS.map((t) => {
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
    </div>
  )
}
