import { useMemo, useState } from 'react'
import type { Checkin, Photo } from '../lib/social'
import { useBingo, useSquads } from '../lib/useSocial'
import { badgesFor, scoreFor, squadScore } from '../lib/points'
import { colorForId, type LiveState } from '../lib/useLiveLocations'
import BingoCard from './BingoCard'

type BoardTab = 'individual' | 'squads'
type SquadsApi = ReturnType<typeof useSquads>
type BingoApi = ReturnType<typeof useBingo>

function initials(name: string | null | undefined): string {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

// The Scores tab: a live leaderboard of everyone's check-in + photo points with
// earned badges, plus a Squads board (Phase 6) totalling each squad's
// squad-stamped check-in points for today.
export default function ScoresView({
  checkins,
  photos,
  myId,
  squads,
  bingo,
  live,
  onManageSquads,
}: {
  checkins: Checkin[]
  photos: Photo[]
  myId: string
  squads: SquadsApi
  bingo: BingoApi
  live: LiveState
  onManageSquads: () => void
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

  const mySquadId = squads.squadOf(myId)

  // Squad board: each squad's total from today's squad-stamped check-ins.
  const squadBoard = useMemo(
    () =>
      squads.squads
        .map((s) => ({
          squad: s,
          members: squads.membersOf(s.id),
          points: squadScore(checkins, s.id),
        }))
        .sort((a, b) => b.points - a.points || a.squad.name.localeCompare(b.squad.name)),
    [squads.squads, squads.members, checkins],
  )

  return (
    <section className="scoresview">
      <header className="view-head">
        <p className="section-eyebrow">Trip standings</p>
        <h1 className="view-title">Scores.</h1>
        <p className="view-lede">
          Check in around town to rack up points — 10 for a verified check-in, 3 from afar, plus
          bonuses for being first and snapping photos. Updates live as the crew roams.
        </p>
        <div className="scores-tabsrow">
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
          {squads.configured && (
            <button className="scores-squadbtn" onClick={onManageSquads}>
              <span className="chip-plus" aria-hidden>＋</span>
              Squads
            </button>
          )}
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
        ) : squadBoard.length === 0 ? (
          <p className="scores-empty">
            No squads yet. Form one, then check in together to climb the board.{' '}
            {squads.configured && (
              <button className="scores-emptylink" onClick={onManageSquads}>
                Start a squad →
              </button>
            )}
          </p>
        ) : (
          <>
            <ol className="board">
              {squadBoard.map((r, i) => (
                <li
                  key={r.squad.id}
                  className={`board-row${r.squad.id === mySquadId ? ' board-row--me' : ''}`}
                >
                  <span className="board-rank mono">{i + 1}</span>
                  <span className="board-squademoji" aria-hidden>{r.squad.emoji || '📍'}</span>
                  <span className="board-name">
                    {r.squad.name}
                    {r.squad.id === mySquadId && <span className="board-you mono">yours</span>}
                  </span>
                  <span className="board-squadavs" aria-hidden>
                    {r.members.slice(0, 5).map((m) => (
                      <span
                        key={m.device_id}
                        className="board-squadav"
                        style={{ ['--av' as string]: colorForId(m.device_id) }}
                        title={m.name || 'Someone'}
                      >
                        {initials(m.name)}
                      </span>
                    ))}
                  </span>
                  <span className="board-points mono">{r.points}</span>
                </li>
              ))}
            </ol>
            <p className="scores-foot">Squad points count today’s check-ins made while in the squad.</p>
          </>
        )}

        <BingoCard checkins={checkins} bingo={bingo} live={live} />
      </div>
    </section>
  )
}
