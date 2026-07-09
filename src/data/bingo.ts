import { venues, venueKey } from './venues'
import type { Checkin, BingoClaim } from '../lib/social'

// ---------------------------------------------------------------------------
// Trip bingo (Phase 9). One shared 5×5 card for the whole crew — a mix of
// "check in at X" squares (auto-completed the moment *anyone* checks in at the
// matching spot) and honor-system challenges (tap-to-claim). Pure data +
// derivation helpers only; no I/O, no React. Both BingoCard (the Scores view)
// and Toasts (crew-wide celebration) read from these helpers so their notion of
// "complete" always agrees.
// ---------------------------------------------------------------------------

export const BINGO_SIZE = 5

export type BingoSquare = {
  id: string
  label: string
  type: 'spot' | 'challenge'
  // Present on spot squares: the spot_key a check-in must match to complete it.
  spot_key?: string
}

// Resolve a curated venue's spot_key by its exact display name. Spot squares
// auto-complete on curated check-ins, which stamp `venueKey(v)` (see MapView),
// so we derive the key from the live venue list rather than hard-coding a slug —
// that guarantees the keys match and surfaces typos loudly during dev.
function keyForVenue(name: string): string {
  const v = venues.find((x) => x.name === name)
  if (!v) {
    if (import.meta.env?.DEV) console.warn(`[bingo] no venue named "${name}"`)
    return 'venue:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }
  return venueKey(v)
}

const spot = (id: string, label: string, venueName: string): BingoSquare => ({
  id,
  label,
  type: 'spot',
  spot_key: keyForVenue(venueName),
})

const chal = (id: string, label: string): BingoSquare => ({ id, label, type: 'challenge' })

// 25 squares, row-major (index 0 = top-left, 24 = bottom-right). Kept short so
// they read inside the tiles; each carries the full flavor in its title on hover.
export const bingoSquares: BingoSquare[] = [
  // Row 0
  spot('cc-hq', 'Convention Center HQ', 'San Diego Convention Center'),
  chal('badge-photo', 'Badge in a photo'),
  spot('el-gordo', 'Tacos el Gordo', 'Tacos el Gordo'),
  chal('rideshare', '3+ crew in one ride'),
  spot('petco', 'Petco Park', 'Petco Park'),
  // Row 1
  chal('mystery-drink', 'Order a drink you can’t pronounce'),
  spot('salt-straw', 'Salt & Straw scoop', 'Salt and Straw'),
  spot('ev-brewing', 'East Village Brewing', 'East Village Brewing Company'),
  chal('esri-shirt', 'Esri shirt in the wild'),
  spot('altitude', 'Altitude at sunset', 'Altitude Sky Lounge'),
  // Row 2
  spot('puesto', 'Puesto lunch', 'Puesto'),
  chal('after-midnight', 'Check in after midnight'),
  spot('balboa', 'Balboa Park Party', 'Balboa Park'),
  chal('crew-selfie', 'Selfie with 5+ crew'),
  spot('noble', 'Find Noble Experiment', 'Noble Experiment'),
  // Row 3
  spot('stone', 'Stone on Kettner', 'Stone Brewing Tap Room – Kettner'),
  chal('karaoke', 'Karaoke at Werewolf'),
  spot('kettner-x', 'Kettner Exchange roof', 'Kettner Exchange'),
  chal('regret-tab', 'Close a regrettable tab'),
  spot('la-puerta', 'La Puerta', 'La Puerta'),
  // Row 4
  spot('ballast', 'Ballast Point Sculpin', 'Ballast Point Brewing'),
  chal('steps', '15k steps in a day'),
  spot('whiskey-house', 'Whiskey House nightcap', 'Whiskey House'),
  chal('sunrise', 'Catch a bay sunrise'),
  spot('marriott', 'Central Coast Meetup', 'Marriott Marquis'),
]

// --- Lines -----------------------------------------------------------------

export type BingoLine = { id: string; label: string; indices: number[] }

const ROW_LABELS = ['Top row', 'Second row', 'Middle row', 'Fourth row', 'Bottom row']
const COL_LABELS = ['Left column', 'Second column', 'Center column', 'Fourth column', 'Right column']

// The 12 winning lines (5 rows, 5 columns, 2 diagonals). Blackout (all 25) is
// handled separately in completedLines since its copy differs.
export const bingoLines: BingoLine[] = (() => {
  const lines: BingoLine[] = []
  for (let r = 0; r < BINGO_SIZE; r++) {
    lines.push({
      id: `row-${r}`,
      label: ROW_LABELS[r],
      indices: Array.from({ length: BINGO_SIZE }, (_, c) => r * BINGO_SIZE + c),
    })
  }
  for (let c = 0; c < BINGO_SIZE; c++) {
    lines.push({
      id: `col-${c}`,
      label: COL_LABELS[c],
      indices: Array.from({ length: BINGO_SIZE }, (_, r) => r * BINGO_SIZE + c),
    })
  }
  lines.push({
    id: 'diag-main',
    label: 'A diagonal',
    indices: Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + i),
  })
  lines.push({
    id: 'diag-anti',
    label: 'A diagonal',
    indices: Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + (BINGO_SIZE - 1 - i)),
  })
  return lines
})()

// --- Derivation (pure) -----------------------------------------------------

// Completion state of one square: whether it's filled, when it first filled,
// and who filled it (the earliest check-in / claim). `at` drives the toast
// mount-gate; `name` drives the "completed by" label on the card.
export type SquareStatus = {
  done: boolean
  at: string | null
  name: string | null
}

// Earliest-first pick of a matching record's (created_at, name).
function earliest<T extends { created_at: string; name: string | null }>(rows: T[]): T | null {
  let best: T | null = null
  for (const r of rows) {
    if (!best || r.created_at.localeCompare(best.created_at) < 0) best = r
  }
  return best
}

// Per-square completion, index-aligned with bingoSquares. Spot squares complete
// on the earliest crew-wide check-in matching their spot_key; challenge squares
// on the earliest claim of their id.
export function squareStatuses(checkins: Checkin[], claims: BingoClaim[]): SquareStatus[] {
  return bingoSquares.map((sq) => {
    if (sq.type === 'spot') {
      const hit = earliest(checkins.filter((c) => c.spot_key === sq.spot_key))
      return hit
        ? { done: true, at: hit.created_at, name: hit.name }
        : { done: false, at: null, name: null }
    }
    const hit = earliest(claims.filter((cl) => cl.square_id === sq.id))
    return hit
      ? { done: true, at: hit.created_at, name: hit.name }
      : { done: false, at: null, name: null }
  })
}

export type CompletedLine = { id: string; label: string; at: string }

// The latest square-completion time across a set of indices — the instant the
// line (or blackout) actually completed. Null if any square is still open.
function lineCompletedAt(statuses: SquareStatus[], indices: number[]): string | null {
  let latest: string | null = null
  for (const i of indices) {
    const s = statuses[i]
    if (!s || !s.done || !s.at) return null
    if (!latest || s.at.localeCompare(latest) > 0) latest = s.at
  }
  return latest
}

// Every completed winning line plus a 'blackout' entry when the whole card is
// filled. `at` is the completing moment, used by the toast layer to ignore the
// backlog that was already complete before a client mounted.
export function completedLines(statuses: SquareStatus[]): CompletedLine[] {
  const out: CompletedLine[] = []
  for (const line of bingoLines) {
    const at = lineCompletedAt(statuses, line.indices)
    if (at) out.push({ id: line.id, label: line.label, at })
  }
  const allAt = lineCompletedAt(
    statuses,
    Array.from({ length: bingoSquares.length }, (_, i) => i),
  )
  if (allAt) out.push({ id: 'blackout', label: 'the whole card', at: allAt })
  return out
}
