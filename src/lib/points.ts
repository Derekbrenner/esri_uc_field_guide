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
// `devices` is the set of device ids belonging to this person (one, or several
// when they share a name across devices — see scoreFor for the single case).
export function scoreForDevices(
  checkins: Checkin[],
  photos: Photo[],
  devices: Set<string>,
): number {
  let score = 0
  const first = firstDeviceBySpot(checkins)
  const firstSpots = new Set<string>()

  for (const c of checkins) {
    if (!devices.has(c.device_id)) continue
    score += c.verified ? POINTS.verifiedCheckin : POINTS.unverifiedCheckin
    // Crew-first at this spot counts if ANY of the person's devices was first.
    if (devices.has(first.get(c.spot_key) ?? '')) firstSpots.add(c.spot_key)
  }
  score += firstSpots.size * POINTS.firstOfCrew

  for (const p of photos) {
    if (devices.has(p.device_id)) score += POINTS.perPhoto
  }
  return score
}

export function scoreFor(checkins: Checkin[], photos: Photo[], deviceId: string): number {
  return scoreForDevices(checkins, photos, new Set([deviceId]))
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

// Badges earned by one person (possibly spanning several devices), given the
// full crew-wide check-in + photo lists. (Rules per Phase 3.)
export function badgesForDevices(
  checkins: Checkin[],
  photos: Photo[],
  devices: Set<string>,
): Badge[] {
  const earned: Badge[] = []
  const mine = checkins.filter((c) => devices.has(c.device_id))
  const myPhotos = photos.filter((p) => devices.has(p.device_id))

  // Crew-wide first check-in ever.
  const firstEver = [...checkins].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  if (firstEver && devices.has(firstEver.device_id)) earned.push(BADGES.firstCheckin)

  // First at any spot.
  const first = firstDeviceBySpot(checkins)
  if ([...first.values()].some((d) => devices.has(d))) earned.push(BADGES.trailblazer)

  // Five distinct spots (across the person's devices).
  if (new Set(mine.map((c) => c.spot_key)).size >= 5) earned.push(BADGES.fiveSpots)

  // Night owl: any check-in between 00:00 and 05:00 local time.
  if (mine.some((c) => { const h = new Date(c.created_at).getHours(); return h >= 0 && h < 5 })) {
    earned.push(BADGES.nightOwl)
  }

  // Shutterbug: five photos.
  if (myPhotos.length >= 5) earned.push(BADGES.shutterbug)

  return earned
}

export function badgesFor(checkins: Checkin[], photos: Photo[], deviceId: string): Badge[] {
  return badgesForDevices(checkins, photos, new Set([deviceId]))
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

// ---------------------------------------------------------------------------
// Reading a location out of what the crew can actually paste: a Google Maps
// link or bare "lat, lng" coordinates. Stays client-side (no geocoding key) —
// it reads coordinates already present in the text, it does not resolve names.
// ---------------------------------------------------------------------------

// True for the shortened share links (maps.app.goo.gl, goo.gl/maps, Apple Maps)
// that DON'T embed coordinates — they only resolve via a redirect the browser
// can't follow cross-origin, so we can't read a location from them. Used to
// show a helpful nudge instead of a blank "couldn't read that".
export function isShortMapLink(raw: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\.com)/i.test(raw)
}

function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

// Pull a lat/lng out of pasted text: a bare "32.71, -117.16", or a full Google
// Maps URL — the "…/@lat,lng,zoom…" the browser address bar shows, the
// "!3dlat!4dlng" place marker baked into a place URL, or a "?q=lat,lng" /
// "?ll=lat,lng" query. Returns null when nothing coordinate-shaped is present
// (e.g. a short share link, or a name-only query).
export function parseLatLng(raw: string): LatLng | null {
  const s = (raw || '').trim()
  if (!s) return null
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`

  const hit =
    // Bare "lat, lng" (comma- or space-separated) pasted on its own.
    s.match(new RegExp(`^${num}\\s*[,\\s]\\s*${num}$`)) ||
    // "!3dlat!4dlng" — the place pin inside a full Maps URL (most precise).
    s.match(new RegExp(`!3d${num}!4d${num}`)) ||
    // "@lat,lng" — the map viewport centre in a "…/place/…/@…" URL.
    s.match(new RegExp(`@${num},${num}`)) ||
    // "?q=/query=/ll=/sll=/destination=/center=lat,lng" query parameters.
    s.match(new RegExp(`[?&](?:q|query|ll|sll|daddr|destination|center)=${num},${num}`, 'i'))

  if (!hit) return null
  const lat = parseFloat(hit[1])
  const lng = parseFloat(hit[2])
  return validLatLng(lat, lng) ? { lat, lng } : null
}
