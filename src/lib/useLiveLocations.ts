import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchLocations,
  isSupabaseConfigured,
  isFresh,
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

function getDeviceId(): string {
  let id = localStorage.getItem(ID_KEY)
  if (!id) {
    id = makeId()
    localStorage.setItem(ID_KEY, id)
  }
  return id
}

export type LiveState = {
  configured: boolean
  sharing: boolean
  name: string
  myId: string
  myColor: string
  others: LiveLocation[] // everyone except me, fresh only
  me: LiveLocation | null
  error: string | null
  start: (name: string) => void
  stop: () => void
  // Remember a display name without turning on location sharing — used by the
  // social layer (e.g. the vote name-gate) so identity stays in one place.
  setName: (name: string) => void
}

export function useLiveLocations(): LiveState {
  const myId = useRef<string>(getDeviceId()).current
  const myColor = DOT_COLORS[Math.abs(hash(myId)) % DOT_COLORS.length]

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
  const fresh = all.filter((l) => isFresh(l, now))
  const me = fresh.find((l) => l.id === myId) ?? null
  const others = fresh.filter((l) => l.id !== myId)

  return {
    configured: isSupabaseConfigured,
    sharing,
    name,
    myId,
    myColor,
    others,
    me,
    error,
    start,
    stop,
    setName: setNamePublic,
  }
}
