import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchLocations,
  isSupabaseConfigured,
  isLive,
  SEEN_AFTER_MS,
  stopSharing as remoteStop,
  subscribeLocations,
  upsertLocation,
  type LiveLocation,
} from './supabase'

const ID_KEY = 'sdfg.deviceId'
const NAME_KEY = 'sdfg.name'
const PUSH_INTERVAL_MS = 15_000

// Warm, distinct dot colors — assigned deterministically from the device id.
const DOT_COLORS = ['#FF6B4A', '#4DBFA6', '#E7C24B', '#C58BF2', '#38E1FF', '#F58BB6', '#F5A65B', '#7FD1FF']

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.abs(hash(String(performance.now()))).toString(36)
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

// Deterministic dot color for a device id — the SAME mapping the live map uses,
// so a person's presence avatar / leaderboard dot matches their live dot color.
export function colorForId(id: string): string {
  return DOT_COLORS[Math.abs(hash(id)) % DOT_COLORS.length]
}

function getDeviceId(): string {
  let id = localStorage.getItem(ID_KEY)
  if (!id) {
    id = makeId()
    localStorage.setItem(ID_KEY, id)
  }
  return id
}

// One person on the map, after merging any devices that share a name. A live
// person is actively pushing fixes; a non-live one is a "last seen X ago" trace.
export type Presence = {
  key: string // merge key (normalized name, or device id when anonymous)
  name: string
  color: string
  lat: number
  lng: number
  updatedAt: string // newest fix across this person's devices
  live: boolean // within LIVE_AFTER_MS → bright, pulsing dot
  isMe: boolean // one of this person's devices is mine
  seenLabel: string // "" when live, else "5m ago" / "2h ago" / "1d ago"
  opacity: number // 1 when live, fading toward ~0.35 as the trace ages
}

// Human "last seen" label. Coarse on purpose so the map/roster only re-render
// when the wording actually changes.
export function formatSeen(iso: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime())
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

// Collapse raw rows into one Presence per person. Devices that share a
// (case-insensitive) real name merge into a single dot at their most-recent
// position; anonymous rows ("Someone" / blank) stay separate, keyed by device.
export function mergePeople(rows: LiveLocation[], now: number, myId: string): Presence[] {
  const groups = new Map<string, LiveLocation[]>()
  for (const r of rows) {
    const nm = (r.name || '').trim().toLowerCase()
    const key = nm && nm !== 'someone' ? `name:${nm}` : `id:${r.id}`
    const arr = groups.get(key)
    if (arr) arr.push(r)
    else groups.set(key, [r])
  }

  const people: Presence[] = []
  for (const [key, arr] of groups) {
    // Representative fix = the newest across the person's devices.
    const newest = arr.reduce((a, b) => (a.updated_at >= b.updated_at ? a : b))
    // Stable per-person color: derive from the lowest device id so it doesn't
    // flip as different devices take turns pushing.
    const primaryId = arr.map((r) => r.id).sort()[0]
    const live = isLive(newest, now)
    const ageMs = now - new Date(newest.updated_at).getTime()
    people.push({
      key,
      name: newest.name || 'Someone',
      color: colorForId(primaryId),
      lat: newest.lat,
      lng: newest.lng,
      updatedAt: newest.updated_at,
      live,
      isMe: arr.some((r) => r.id === myId),
      seenLabel: live ? '' : formatSeen(newest.updated_at, now),
      opacity: live ? 1 : Math.max(0.35, 0.8 - 0.45 * (ageMs / SEEN_AFTER_MS)),
    })
  }

  // Live first, then most-recently seen.
  return people.sort(
    (a, b) => Number(b.live) - Number(a.live) || b.updatedAt.localeCompare(a.updatedAt),
  )
}

export type LiveState = {
  configured: boolean
  sharing: boolean
  name: string
  myId: string
  myColor: string
  people: Presence[] // everyone within the last-seen window, merged by name
  liveCount: number // how many of `people` are live right now
  me: LiveLocation | null // my own device's live fix (null unless live)
  error: string | null
  start: (name: string) => void
  stop: () => void
  // Remember a display name without turning on location sharing — used by the
  // social layer (e.g. the vote name-gate) so identity stays in one place.
  setName: (name: string) => void
}

export function useLiveLocations(): LiveState {
  const myId = useRef<string>(getDeviceId()).current
  const myColor = colorForId(myId)

  const [sharing, setSharing] = useState(false)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [all, setAll] = useState<LiveLocation[]>([])
  const [error, setError] = useState<string | null>(null)

  const watchId = useRef<number | null>(null)
  const lastPush = useRef<number>(0)
  const lastPos = useRef<GeolocationPosition | null>(null)
  const nameRef = useRef(name)
  nameRef.current = name

  const refresh = useCallback(async () => {
    const data = await fetchLocations()
    setAll(data)
  }, [])

  // Poll + realtime subscribe for everyone's dots.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    refresh()
    const unsub = subscribeLocations(refresh)
    const poll = window.setInterval(refresh, 20_000)
    return () => {
      unsub()
      window.clearInterval(poll)
    }
  }, [refresh])

  const push = useCallback(
    async (pos: GeolocationPosition) => {
      lastPos.current = pos
      lastPush.current = Date.now()
      const { error: err } = await upsertLocation({
        id: myId,
        name: nameRef.current || 'Someone',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        color: myColor,
      })
      if (err) setError(err)
      else {
        setError(null)
        refresh()
      }
    },
    [myId, myColor, refresh],
  )

  const start = useCallback(
    (who: string) => {
      const trimmed = who.trim() || 'Someone'
      setName(trimmed)
      localStorage.setItem(NAME_KEY, trimmed)
      nameRef.current = trimmed

      if (!isSupabaseConfigured) {
        setError('Live sharing isn’t connected yet — add your Supabase keys (see setup).')
        return
      }
      if (!('geolocation' in navigator)) {
        setError('This device can’t share location.')
        return
      }
      setSharing(true)
      setError(null)
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          // Push immediately on first fix, then at most every PUSH_INTERVAL_MS.
          if (Date.now() - lastPush.current >= PUSH_INTERVAL_MS || !lastPos.current) {
            push(pos)
          } else {
            lastPos.current = pos
          }
        },
        (geoErr) => {
          setError(
            geoErr.code === geoErr.PERMISSION_DENIED
              ? 'Location permission denied. Enable it in your browser to share.'
              : 'Couldn’t get your location.',
          )
          setSharing(false)
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      )
    },
    [push],
  )

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setSharing(false)
    remoteStop(myId)
    refresh()
  }, [myId, refresh])

  const setNamePublic = useCallback((who: string) => {
    const trimmed = who.trim() || 'Someone'
    setName(trimmed)
    localStorage.setItem(NAME_KEY, trimmed)
    nameRef.current = trimmed
  }, [])

  // Heartbeat: if we're sharing and have a recent fix, keep it warm.
  useEffect(() => {
    if (!sharing) return
    const t = window.setInterval(() => {
      if (lastPos.current) push(lastPos.current)
    }, PUSH_INTERVAL_MS)
    return () => window.clearInterval(t)
  }, [sharing, push])

  // Clean up the watcher if the component unmounts.
  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  const now = Date.now()
  const people = mergePeople(all, now, myId)
  const liveCount = people.filter((p) => p.live).length
  // My own device's live fix — used for "center on me" / "use my location".
  // Null unless it's actually live, so those actions fall back to a fresh GPS
  // read rather than flying to a stale spot.
  const myRow = all.find((l) => l.id === myId) ?? null
  const me = myRow && isLive(myRow, now) ? myRow : null

  return {
    configured: isSupabaseConfigured,
    sharing,
    name,
    myId,
    myColor,
    people,
    liveCount,
    me,
    error,
    start,
    stop,
    setName: setNamePublic,
  }
}
