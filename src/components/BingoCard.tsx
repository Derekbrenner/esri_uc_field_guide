import { useMemo } from 'react'
import type { Checkin } from '../lib/social'
import type { useBingo } from '../lib/useSocial'
import { useNameGate } from '../lib/useSocial'
import type { LiveState } from '../lib/useLiveLocations'
import NamePrompt from './NamePrompt'
import { bingoLines, bingoSquares, squareStatuses } from '../data/bingo'

type BingoApi = ReturnType<typeof useBingo>
const NAME_KEY = 'sdfg.name'

function firstName(name: string | null | undefined): string {
  return (name || 'Someone').trim().split(/\s+/)[0] || 'Someone'
}

// The shared trip-bingo card on the Scores view. One 5×5 grid for the whole
// crew: spot squares fill in automatically the moment anyone checks in at the
// matching spot; challenge squares are honor-system, tap-to-claim. Completed
// squares show who filled them. Line + blackout celebrations fire crew-wide from
// Toasts (always mounted), so they land even for people not on this tab.
export default function BingoCard({
  checkins,
  bingo,
  live,
}: {
  checkins: Checkin[]
  bingo: BingoApi
  live: LiveState
}) {
  const gate = useNameGate(live)

  const statuses = useMemo(() => squareStatuses(checkins, bingo.claims), [checkins, bingo.claims])

  const doneCount = useMemo(() => statuses.filter((s) => s.done).length, [statuses])

  // Indices belonging to any fully-completed line, for a celebratory tint.
  const lineIndices = useMemo(() => {
    const set = new Set<number>()
    for (const line of bingoLines) {
      if (line.indices.every((i) => statuses[i]?.done)) {
        for (const i of line.indices) set.add(i)
      }
    }
    return set
  }, [statuses])

  const bingoCount = useMemo(
    () => bingoLines.filter((line) => line.indices.every((i) => statuses[i]?.done)).length,
    [statuses],
  )

  if (!bingo.configured) return null

  const nameNow = () => (localStorage.getItem(NAME_KEY) || 'Someone').trim() || 'Someone'

  const onSquare = (id: string, type: 'spot' | 'challenge') => {
    // Spot squares only fill from real check-ins on the map — nothing to tap.
    if (type !== 'challenge') return
    gate.request(() => bingo.toggleClaim(id, { deviceId: live.myId, name: nameNow() }))
  }

  return (
    <section className="bingo" aria-label="Trip bingo">
      <div className="bingo-head">
        <div>
          <p className="section-eyebrow">Crew card</p>
          <h2 className="bingo-title">Trip Bingo.</h2>
        </div>
        <div className="bingo-progress">
          <span className="bingo-progress-num mono">{doneCount}/25</span>
          {bingoCount > 0 && (
            <span className="bingo-progress-bingos">
              {bingoCount} bingo{bingoCount > 1 ? 's' : ''}
              {doneCount === 25 ? ' · blackout 🎉' : ''}
            </span>
          )}
        </div>
      </div>
      <p className="bingo-lede">
        One card for the whole crew. Place squares check off when anyone checks in there; tap a
        challenge to claim it. Complete a row, column, or diagonal to set off a celebration.
      </p>

      <div className="bingo-grid" role="grid" aria-label="Bingo squares">
        {bingoSquares.map((sq, i) => {
          const st = statuses[i]
          const done = !!st?.done
          const mine = sq.type === 'challenge' && bingo.minedFor(sq.id, live.myId)
          const claimants = sq.type === 'challenge' ? bingo.claimantsFor(sq.id) : []
          const by =
            sq.type === 'spot'
              ? st?.name
                ? firstName(st.name)
                : null
              : claimants.length
                ? `${firstName(claimants[0].name)}${claimants.length > 1 ? ` +${claimants.length - 1}` : ''}`
                : null
          const cls = [
            'bingo-sq',
            `bingo-sq--${sq.type}`,
            done ? 'bingo-sq--done' : '',
            mine ? 'bingo-sq--mine' : '',
            done && lineIndices.has(i) ? 'bingo-sq--line' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const inner = (
            <>
              <span className="bingo-sq-mark" aria-hidden>
                {done ? '✓' : sq.type === 'spot' ? '◎' : '✦'}
              </span>
              <span className="bingo-sq-label">{sq.label}</span>
              {by && <span className="bingo-sq-by">{by}</span>}
            </>
          )

          if (sq.type === 'challenge') {
            return (
              <button
                key={sq.id}
                type="button"
                role="gridcell"
                className={cls}
                onClick={() => onSquare(sq.id, sq.type)}
                aria-pressed={mine}
                title={sq.label}
              >
                {inner}
              </button>
            )
          }
          return (
            <div key={sq.id} role="gridcell" className={cls} title={`${sq.label} — check in on the map`}>
              {inner}
            </div>
          )
        })}
      </div>
      <p className="bingo-foot">
        <span className="bingo-legend"><span aria-hidden>◎</span> check-in spot</span>
        <span className="bingo-legend"><span aria-hidden>✦</span> tap to claim</span>
      </p>

      <NamePrompt
        open={gate.promptOpen}
        onSave={gate.resolve}
        onCancel={gate.cancel}
        title="Who’s claiming?"
        lede="Pick your name so the crew knows who filled the square. Saved on this device only."
        cta="Save & claim"
      />
    </section>
  )
}
