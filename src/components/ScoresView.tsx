import { useMemo, useState } from 'react'
import type { Checkin, Photo } from '../lib/social'
import { badgesFor, scoreFor } from '../lib/points'
import { colorForId } from '../lib/useLiveLocations'

type BoardTab = 'individual' | 'squads'

// The Scores tab: a live leaderboard of everyone's check-in (and, from Phase 4,
// photo) points, with earned badges. The Squads sub-tab is scaffolded here but
// stays dormant until Phase 6 wires squad totals.
export default function ScoresView({
  checkins,
  photos,
  myId,
}: {
  checkins: Checkin[]
  photos: Photo[]
  myId: string
}) {
  const [tab, setTab] = useState<BoardTab>('individual')

  const board = useMemo(() => {
    // Everyone who has any activity.
    const devices = new Set<string>()
    for (const c of checkins) devices.add(c.device_id)
    for (const p of photos) devices.add(p.device_id)

    // Most-recent display name per device (check-ins/photos win by recency).
    const nameOf = new Map<string, string>()
    const newest = [
      ...checkins.map((c) => ({ device_id: c.device_id, name: c.name, at: c.created_at })),
      ...photos.map((p) => ({ device_id: p.device_id, name: p.name, at: p.created_at })),
    ].sort((a, b) => b.at.localeCompare(a.at))
    for (const r of newest) if (r.name && !nameOf.has(r.device_id)) nameOf.set(r.device_id, r.name)

    return [...devices]
      .map((d) => ({
        deviceId: d,
        name: nameOf.get(d) || 'Someone',
        color: colorForId(d),
        points: scoreFor(checkins, photos, d),
        badges: badgesFor(checkins, photos, d),
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  }, [checkins, photos])

  return (
    <section className="scoresview">
      <header className="view-head">
        <p className="section-eyebrow">Trip standings</p>
        <h1 className="view-title">Scores.</h1>
        <p className="view-lede">
          Check in around town to rack up points — 10 for a verified check-in, 3 from afar, plus
          bonuses for being first and snapping photos. Updates live as the crew roams.
        </p>
        <div className="segmented" role="tablist" aria-label="Leaderboard view">
          <button
            role="tab"
            aria-selected={tab === 'individual'}
            className={`segmented-btn${tab === 'individual' ? ' segmented-btn--on' : ''}`}
            onClick={() => setTab('individual')}
          >
            Individual
          </button>
          <button
            role="tab"
            aria-selected={tab === 'squads'}
            className={`segmented-btn${tab === 'squads' ? ' segmented-btn--on' : ''}`}
            onClick={() => setTab('squads')}
          >
            Squads
          </button>
        </div>
      </header>

      <div className="scores-body">
        {tab === 'individual' ? (
          board.length === 0 ? (
            <p className="scores-empty">No check-ins yet — be the first on the map.</p>
          ) : (
            <ol className="board">
              {board.map((r, i) => (
                <li
                  key={r.deviceId}
                  className={`board-row${r.deviceId === myId ? ' board-row--me' : ''}`}
                >
                  <span className="board-rank mono">{i + 1}</span>
                  <span className="board-dot" style={{ background: r.color }} aria-hidden />
                  <span className="board-name">
                    {r.name}
                    {r.deviceId === myId && <span className="board-you mono">you</span>}
                  </span>
                  {r.badges.length > 0 && (
                    <span className="board-badges">
                      {r.badges.map((b) => (
                        <span key={b.id} className="board-badge" title={b.label}>
                          {b.emoji}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="board-points mono">{r.points}</span>
                </li>
              ))}
            </ol>
          )
        ) : (
          <p className="scores-empty">
            Squad standings light up once squads arrive. Form one, then check in together to climb
            the board.
          </p>
        )}
      </div>
    </section>
  )
}
