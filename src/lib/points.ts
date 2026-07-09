import type { Checkin, Photo } from './social'

// ---------------------------------------------------------------------------
// Pure scoring / geo helpers. No I/O, no React — safe to unit test and reuse
// anywhere. Point + badge rules are the ones defined in Phase 3 of the spec;
// they're coded here up front so later phases only wire up the UI.
// ---------------------------------------------------------------------------

export type LatLng = { lat: number; lng: number }

// Great-circle distance between two points, in metres.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000 // Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Point values (Phase 3).
export const POINTS = {
  verifiedCheckin: 10,
  unverifiedCheckin: 3,
  firstOfCrew: 5, // being the first person ever to check in at a spot_key
  perPhoto: 2,
} as const

// Maps each spot_key to the device of its earliest (crew-first) check-in.
function firstDeviceBySpot(checkins: Checkin[]): Map<string, string> {
  const first = new Map<string, string>()
  const ordered = [...checkins].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const c of ordered) {
    if (!first.has(c.spot_key)) first.set(c.spot_key, c.device_id)
  }
  return first
}

// Total points for one person. `checkins` / `photos` are the full crew-wide
// lists — the crew-first bonus needs everyone's data to know who was first.
export function scoreFor(checkins: Checkin[], photos: Photo[], deviceId: string): number {
  let score = 0
  const first = firstDeviceBySpot(checkins)
  const firstSpots = new Set<string>()

  for (const c of checkins) {
    if (c.device_id !== deviceId) continue
    score += c.verified ? POINTS.verifiedCheckin : POINTS.unverifiedCheckin
    if (first.get(c.spot_key) === deviceId) firstSpots.add(c.spot_key)
  }
  score += firstSpots.size * POINTS.firstOfCrew

  for (const p of photos) {
    if (p.device_id === deviceId) score += POINTS.perPhoto
  }
  return score
}

// --- Badges ----------------------------------------------------------------

export type Badge = { id: string; label: string; emoji: string }

// Catalog. Shutterbug stays dormant until photos land in Phase 4.
export const BADGES: Record<string, Badge> = {
  firstCheckin: { id: 'first-checkin', label: 'First Check-in', emoji: '🥇' },
  trailblazer: { id: 'trailblazer', label: 'Trailblazer', emoji: '🧭' },
  fiveSpots: { id: 'five-spots', label: '5 Spots', emoji: '🗺️' },
  nightOwl: { id: 'night-owl', label: 'Night Owl', emoji: '🦉' },
  shutterbug: { id: 'shutterbug', label: 'Shutterbug', emoji: '📸' },
}

// Badges earned by one person, given the full crew-wide check-in + photo lists.
// (Rules per Phase 3; refine freely as the game evolves.)
export function badgesFor(checkins: Checkin[], photos: Photo[], deviceId: string): Badge[] {
  const earned: Badge[] = []
  const mine = checkins.filter((c) => c.device_id === deviceId)
  const myPhotos = photos.filter((p) => p.device_id === deviceId)

  // Crew-wide first check-in ever.
  const firstEver = [...checkins].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  if (firstEver && firstEver.device_id === deviceId) earned.push(BADGES.firstCheckin)

  // First at any spot.
  const first = firstDeviceBySpot(checkins)
  if ([...first.values()].includes(deviceId)) earned.push(BADGES.trailblazer)

  // Five distinct spots.
  if (new Set(mine.map((c) => c.spot_key)).size >= 5) earned.push(BADGES.fiveSpots)

  // Night owl: any check-in between 00:00 and 05:00 local time.
  if (mine.some((c) => { const h = new Date(c.created_at).getHours(); return h >= 0 && h < 5 })) {
    earned.push(BADGES.nightOwl)
  }

  // Shutterbug: five photos.
  if (myPhotos.length >= 5) earned.push(BADGES.shutterbug)

  return earned
}

// --- Squads (Phase 6) -------------------------------------------------------

// True when an ISO timestamp falls on the same local calendar day as `now`.
export function isSameLocalDay(iso: string, now: number = Date.now()): boolean {
  const d = new Date(iso)
  const n = new Date(now)
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

// A squad's rallied location from its members' current open check-ins: the spot
// where a majority of the checked-in members are. `openSpotKeys` is one
// spot_key per checked-in member. Returns null when nobody's checked in or no
// single spot holds a majority — the caller renders that as "scattered".
export function squadLocation(openSpotKeys: string[]): string | null {
  if (openSpotKeys.length === 0) return null
  const counts = new Map<string, number>()
  for (const k of openSpotKeys) counts.set(k, (counts.get(k) ?? 0) + 1)
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  // Require a strict majority of the checked-in members, else "scattered".
  return bestN * 2 > openSpotKeys.length ? best : null
}

// --- Meetups (Phase 7) ------------------------------------------------------

// Compact local time label for a meetup, e.g. "7:30 PM". Empty for no / bad time.
export function formatMeetupTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Day-aware label used on the upcoming-meetup banner: just the time when it's
// today ("7:30 PM"), else prefixed with the weekday ("Mon · 7:30 PM").
export function formatMeetupWhen(iso: string | null | undefined, now: number = Date.now()): string {
  const t = formatMeetupTime(iso)
  if (!t || !iso) return t
  if (isSameLocalDay(iso, now)) return t
  const wd = new Date(iso).toLocaleDateString([], { weekday: 'short' })
  return `${wd} · ${t}`
}

// A squad's score (Phase 6): points from check-ins stamped with this squad
// today. Each squad-stamped check-in contributes its verified/unverified value,
// plus the first-of-crew bonus for any spot a member reached first crew-wide.
// Photos aren't squad-scoped, so they don't count toward squad totals. Summed
// this way, a squad's total equals its members' individual check-in points for
// the day, so the two boards reconcile.
export function squadScore(
  checkins: Checkin[],
  squadId: string,
  now: number = Date.now(),
): number {
  const first = firstDeviceBySpot(checkins) // crew-wide earliest per spot
  const firstAwarded = new Set<string>() // dedupe the +5 per (device, spot)
  let score = 0
  for (const c of checkins) {
    if (c.squad_id !== squadId) continue
    if (!isSameLocalDay(c.created_at, now)) continue
    score += c.verified ? POINTS.verifiedCheckin : POINTS.unverifiedCheckin
    if (first.get(c.spot_key) === c.device_id) {
      const k = `${c.device_id}@${c.spot_key}`
      if (!firstAwarded.has(k)) {
        firstAwarded.add(k)
        score += POINTS.firstOfCrew
      }
    }
  }
  return score
}
