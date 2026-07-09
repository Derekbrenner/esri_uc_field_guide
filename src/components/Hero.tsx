import type { Tab } from '../App'
import type { LiveState } from '../lib/useLiveLocations'
import { schedule, tips } from '../data/schedule'
import { venues } from '../data/venues'
import { crew } from '../data/attendees'
import Contours from './Contours'

const TODAY_ISO = '2026-07-09' // wired to the trip; today = day before arrivals begin

function daysUntil(iso: string): number {
  const a = new Date(TODAY_ISO + 'T00:00:00')
  const b = new Date(iso + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export default function Hero({ onNav, live }: { onNav: (t: Tab) => void; live: LiveState }) {
  const spotCount = venues.filter((v) => !v.landmark).length
  const crewCount = crew.reduce((n, g) => n + g.people.length, 0)
  const liveCount = live.others.length + (live.me ? 1 : 0)

  // The next day on the itinerary from "today".
  const upcoming = schedule.find((d) => daysUntil(d.iso) >= 0) ?? schedule[schedule.length - 1]
  const dUntil = daysUntil(upcoming.iso)

  return (
    <section className="hero">
      <Contours className="hero-topo" />
      <div className="hero-inner">
        <p className="eyebrow">
          <span className="mono">32.7065° N · 117.1610° W</span>
          <span className="eyebrow-dot" aria-hidden>·</span>
          <span className="mono">JUL 10–17 · 2026</span>
        </p>

        <h1 className="hero-title">
          The crew’s field guide to<br />
          <span className="hero-title-accent">Esri UC, San Diego.</span>
        </h1>

        <p className="hero-lede">
          One place for the whole week — where to eat, what’s on the schedule, who’s in town, and a
          live map of where everyone actually is right now.
        </p>

        <div className="hero-actions">
          <button className="btn btn--primary" onClick={() => onNav('Map')}>
            Open the live map
            <span className="btn-arrow" aria-hidden>→</span>
          </button>
          <button className="btn btn--ghost" onClick={() => onNav('Schedule')}>
            See the schedule
          </button>
        </div>

        <div className="hero-live" role="status">
          <span className={`ping${liveCount > 0 ? ' ping--on' : ''}`} aria-hidden>
            <span className="ping-core" />
          </span>
          {live.configured ? (
            liveCount > 0 ? (
              <span>
                <strong>{liveCount}</strong> {liveCount === 1 ? 'person is' : 'people are'} sharing
                location right now.
              </span>
            ) : (
              <span>Live map is on. No one’s sharing yet — be the first from the map.</span>
            )
          ) : (
            <span>Live sharing turns on once Supabase keys are added — the map still works now.</span>
          )}
        </div>

        <dl className="stat-row">
          <div className="stat">
            <dt>Days on the ground</dt>
            <dd className="mono">8</dd>
          </div>
          <div className="stat">
            <dt>Food & drink spots</dt>
            <dd className="mono">{spotCount}</dd>
          </div>
          <div className="stat">
            <dt>Crew in town</dt>
            <dd className="mono">{crewCount}+</dd>
          </div>
          <div className="stat">
            <dt>Next up</dt>
            <dd className="mono">
              {dUntil <= 0 ? 'Today' : dUntil === 1 ? 'Tomorrow' : `${upcoming.weekday.slice(0, 3)} ${upcoming.date}`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="hero-cards">
        <NavCard
          label="Live Map"
          coord="the where"
          desc="Every food & drink spot, plus live dots for everyone sharing."
          onClick={() => onNav('Map')}
        />
        <NavCard
          label="Food & Drink"
          coord={`${spotCount} spots`}
          desc="Tacos, breweries, rooftops and cocktail bars — sorted by type."
          onClick={() => onNav('Food & Drink')}
        />
        <NavCard
          label="Schedule"
          coord="Jul 10–17"
          desc="Day-by-day: sessions, group dinners and socials."
          onClick={() => onNav('Schedule')}
        />
        <NavCard
          label="Crew"
          coord={`${crewCount}+ people`}
          desc="Who’s coming, and when they land and leave."
          onClick={() => onNav('Crew')}
        />
      </div>

      <div className="tips">
        <h2 className="section-eyebrow">Field notes</h2>
        <ul className="tips-list">
          {tips.map((t, i) => (
            <li key={i}>
              <span className="tips-idx mono">{String(i + 1).padStart(2, '0')}</span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function NavCard({
  label,
  coord,
  desc,
  onClick,
}: {
  label: string
  coord: string
  desc: string
  onClick: () => void
}) {
  return (
    <button className="navcard" onClick={onClick}>
      <span className="navcard-top mono">{coord}</span>
      <span className="navcard-label">{label}</span>
      <span className="navcard-desc">{desc}</span>
      <span className="navcard-go" aria-hidden>→</span>
    </button>
  )
}
