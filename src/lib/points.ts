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

// Combined points for a set of devices (a squad's members). Phase 6 refines
// this to only count today's squad-stamped check-ins; for now it's the sum of
// member scores.
export function squadScore(checkins: Checkin[], photos: Photo[], deviceIds: string[]): number {
  return deviceIds.reduce((sum, d) => sum + scoreFor(checkins, photos, d), 0)
}
