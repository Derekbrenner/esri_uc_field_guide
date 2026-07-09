import { useEffect, useState } from 'react'
import { useLiveLocations } from './lib/useLiveLocations'
import Hero from './components/Hero'
import MapView from './components/MapView'
import FoodView from './components/FoodView'
import ScheduleView from './components/ScheduleView'
import CrewView from './components/CrewView'

const TABS = ['Guide', 'Map', 'Food & Drink', 'Schedule', 'Crew'] as const
export type Tab = (typeof TABS)[number]

export default function App() {
  const [tab, setTab] = useState<Tab>('Guide')
  const live = useLiveLocations()

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
              {t === 'Map' && live.configured && liveCount > 0 && (
                <span className="tab-badge" title={`${liveCount} sharing now`}>{liveCount}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main id="main" className="main">
        {tab === 'Guide' && <Hero onNav={go} live={live} />}
        {tab === 'Map' && <MapView live={live} />}
        {tab === 'Food & Drink' && <FoodView onNav={go} />}
        {tab === 'Schedule' && <ScheduleView />}
        {tab === 'Crew' && <CrewView />}
      </main>

      <footer className="footer">
        <span className="mono">32.7065° N, 117.1610° W</span>
        <span>San Diego Convention Center · The crew’s field guide to Esri UC 2026</span>
      </footer>
    </div>
  )
}
