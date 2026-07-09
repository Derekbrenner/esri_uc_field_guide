import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isSupabaseConfigured,
  // spots
  fetchSpots,
  insertSpot,
  updateSpot,
  deleteSpot,
  subscribeSpots,
  // votes
  fetchVotes,
  addVote,
  removeVote,
  subscribeVotes,
  // check-ins
  fetchCheckins,
  insertCheckin,
  endOpenCheckins,
  subscribeCheckins,
  // squads
  fetchSquads,
  insertSquad,
  subscribeSquads,
  fetchSquadMembers,
  joinSquad as joinSquadRemote,
  leaveAllSquads,
  subscribeSquadMembers,
  // photos
  fetchPhotos,
  uploadPhoto,
  deletePhoto,
  subscribePhotos,
  // meetups
  fetchMeetups,
  insertMeetup,
  cancelMeetup as cancelMeetupRemote,
  subscribeMeetups,
  fetchMeetupRsvps,
  upsertRsvp,
  subscribeMeetupRsvps,
  // attendees
  fetchAttendees,
  insertAttendee,
  updateAttendee,
  deleteAttendee,
  subscribeAttendees,
  // schedule items
  fetchScheduleItems,
  insertScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  subscribeScheduleItems,
  type Spot,
  type Vote,
  type Checkin,
  type Squad,
  type SquadMember,
  type Photo,
  type Meetup,
  type MeetupRsvp,
  type AttendeeRow,
  type ScheduleItemRow,
  type Identity,
} from './social'

// ---------------------------------------------------------------------------
// React hooks for the social layer. Each mirrors useLiveLocations.ts: an
// initial fetch, a realtime subscription (with a slow poll as a safety net),
// and optimistic local mutations that reconcile against the server on the next
// fetch. Every hook returns empty/inert values when Supabase isn't configured
// (the effect never runs, so the row list stays []), plus a `configured` flag
// so consumers can gate their UI exactly like useLiveLocations does.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 20_000

// Result shape for a mutation: same `{ error }` convention as src/lib/social.ts.
type MutationResult = { error: string | null }

// Generic "fetch + subscribe + poll" backbone, mirroring the effect in
// useLiveLocations.ts. `fetcher` and `subscriber` must be stable references
// (the module-level functions in social.ts are), so the effect runs once.
function useRealtimeList<T>(
  fetcher: () => Promise<T[]>,
  subscriber: (onChange: () => void) => () => void,
) {
  const [rows, setRows] = useState<T[]>([])

  const refresh = useCallback(async () => {
    const data = await fetcher()
    setRows(data)
  }, [fetcher])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    refresh()
    const unsub = subscriber(refresh)
    const poll = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      unsub()
      window.clearInterval(poll)
    }
  }, [refresh, subscriber])

  return { rows, setRows, refresh }
}

// --- Spots -----------------------------------------------------------------

export function useSpots() {
  const { rows, setRows, refresh } = useRealtimeList<Spot>(fetchSpots, subscribeSpots)

  const addSpot = useCallback(
    async (input: Parameters<typeof insertSpot>[0]) => {
      const { data, error } = await insertSpot(input)
      if (data) setRows((prev) => [...prev, data])
      return { data, error }
    },
    [setRows],
  )

  const editSpot = useCallback(
    async (id: string, patch: Parameters<typeof updateSpot>[1]): Promise<MutationResult> => {
      setRows((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
      const { error } = await updateSpot(id, patch)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  const removeSpot = useCallback(
    async (id: string): Promise<MutationResult> => {
      setRows((prev) => prev.filter((s) => s.id !== id))
      const { error } = await deleteSpot(id)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  return { spots: rows, addSpot, editSpot, removeSpot, configured: isSupabaseConfigured }
}

// --- Votes -----------------------------------------------------------------

// localStorage keys shared with useLiveLocations (device identity + name).
const VOTE_DEVICE_ID_KEY = 'sdfg.deviceId'
const VOTE_NAME_KEY = 'sdfg.name'

function voterDeviceId(): string {
  let id = localStorage.getItem(VOTE_DEVICE_ID_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'id-' + Math.random().toString(36).slice(2)
    localStorage.setItem(VOTE_DEVICE_ID_KEY, id)
  }
  return id
}

// Self-contained voting surface consumed by the map / food views (Phase 2).
// Identity is derived internally from the shared localStorage triple, so the
// UI just calls toggle(spotKey).
export type VotesApi = {
  configured: boolean
  countFor: (spotKey: string) => number
  hasMine: (spotKey: string) => boolean
  toggle: (spotKey: string) => void
  // Spot keys with ≥1 vote, most-voted first — drives the "Top voted" lens.
  topKeys: string[]
  total: number
}

export function useVotes(): VotesApi {
  const myId = useRef<string>(isSupabaseConfigured ? voterDeviceId() : '').current
  const { rows, setRows, refresh } = useRealtimeList<Vote>(fetchVotes, subscribeVotes)
  const rowsRef = useRef<Vote[]>(rows)
  rowsRef.current = rows

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.spot_key, (m.get(r.spot_key) ?? 0) + 1)
    return m
  }, [rows])

  const mine = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.device_id === myId) s.add(r.spot_key)
    return s
  }, [rows, myId])

  const countFor = useCallback((spotKey: string) => counts.get(spotKey) ?? 0, [counts])
  const hasMine = useCallback((spotKey: string) => mine.has(spotKey), [mine])

  const topKeys = useMemo(
    () =>
      [...counts.entries()]
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k),
    [counts],
  )

  const toggle = useCallback(
    (spotKey: string) => {
      if (!isSupabaseConfigured) return
      const current = rowsRef.current
      const had = current.some((r) => r.spot_key === spotKey && r.device_id === myId)
      const name = (localStorage.getItem(VOTE_NAME_KEY) || 'Someone').trim()

      // Optimistic: reflect the tap immediately, reconcile from the server after.
      if (had) {
        setRows(current.filter((r) => !(r.spot_key === spotKey && r.device_id === myId)))
      } else {
        setRows([
          ...current,
          { spot_key: spotKey, device_id: myId, name, created_at: new Date().toISOString() },
        ])
      }

      const run = async () => {
        if (had) {
          await removeVote(spotKey, myId)
        } else {
          await addVote(spotKey, { deviceId: myId, name })
        }
        // Reconcile with the server once the write lands.
        refresh()
      }
      run()
    },
    [myId, refresh, setRows],
  )

  const inert: VotesApi = {
    configured: false,
    countFor: () => 0,
    hasMine: () => false,
    toggle: () => {},
    topKeys: [],
    total: 0,
  }

  if (!isSupabaseConfigured) return inert

  return {
    configured: true,
    countFor,
    hasMine,
    toggle,
    topKeys,
    total: rows.length,
  }
}

// A small gate around voting: if the user hasn't set a display name yet, hold
// the tap and open the name picker first, then record the vote once they save.
// Reuses the existing identity (localStorage name via `live.setName`).
export type VoteGate = {
  request: (spotKey: string) => void
  promptOpen: boolean
  resolve: (name: string) => void
  cancel: () => void
}

export function useVoteGate(
  votes: VotesApi,
  live: { name: string; setName: (name: string) => void },
): VoteGate {
  const [promptOpen, setPromptOpen] = useState(false)
  const pending = useRef<string | null>(null)

  const request = useCallback(
    (spotKey: string) => {
      if (!votes.configured) return
      if (live.name && live.name.trim()) {
        votes.toggle(spotKey)
        return
      }
      pending.current = spotKey
      setPromptOpen(true)
    },
    [votes, live.name],
  )

  const resolve = useCallback(
    (name: string) => {
      live.setName(name) // writes localStorage synchronously
      const key = pending.current
      pending.current = null
      setPromptOpen(false)
      if (key) votes.toggle(key)
    },
    [votes, live],
  )

  const cancel = useCallback(() => {
    pending.current = null
    setPromptOpen(false)
  }, [])

  return { request, promptOpen, resolve, cancel }
}

// A generic version of the vote name-gate: if the user hasn't set a display
// name yet, hold the pending action and open the name picker first, then run it
// once they save. Reuses the shared identity (localStorage name via setName).
// Used by check-ins (and any future social action that needs a name).
export type NameGate = {
  request: (action: () => void) => void
  promptOpen: boolean
  resolve: (name: string) => void
  cancel: () => void
}

export function useNameGate(live: { name: string; setName: (name: string) => void }): NameGate {
  const [promptOpen, setPromptOpen] = useState(false)
  const pending = useRef<null | (() => void)>(null)

  const request = useCallback(
    (action: () => void) => {
      if (!isSupabaseConfigured) return
      if (live.name && live.name.trim()) {
        action()
        return
      }
      pending.current = action
      setPromptOpen(true)
    },
    [live.name],
  )

  const resolve = useCallback(
    (name: string) => {
      live.setName(name) // writes localStorage synchronously
      const action = pending.current
      pending.current = null
      setPromptOpen(false)
      if (action) action()
    },
    [live],
  )

  const cancel = useCallback(() => {
    pending.current = null
    setPromptOpen(false)
  }, [])

  return { request, promptOpen, resolve, cancel }
}

// --- Check-ins -------------------------------------------------------------

export function useCheckins() {
  const { rows, setRows, refresh } = useRealtimeList<Checkin>(fetchCheckins, subscribeCheckins)

  // The person's current open (not yet ended) check-in, if any.
  const openFor = useCallback(
    (deviceId: string) => rows.find((c) => c.device_id === deviceId && !c.ended_at) ?? null,
    [rows],
  )

  // Everyone with an open check-in at a given spot.
  const openAt = useCallback(
    (spotKey: string) => rows.filter((c) => c.spot_key === spotKey && !c.ended_at),
    [rows],
  )

  const checkIn = useCallback(
    async (input: Parameters<typeof insertCheckin>[0]) => {
      const { data, error } = await insertCheckin(input)
      if (data) {
        const now = new Date().toISOString()
        // insertCheckin closes prior open check-ins server-side; mirror that
        // locally and prepend the new one.
        setRows((prev) => [
          data,
          ...prev.map((c) =>
            c.device_id === input.device_id && !c.ended_at ? { ...c, ended_at: now } : c,
          ),
        ])
      }
      return { data, error }
    },
    [setRows],
  )

  const checkOut = useCallback(
    async (deviceId: string): Promise<MutationResult> => {
      const now = new Date().toISOString()
      setRows((prev) =>
        prev.map((c) => (c.device_id === deviceId && !c.ended_at ? { ...c, ended_at: now } : c)),
      )
      const { error } = await endOpenCheckins(deviceId)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  return { checkins: rows, openFor, openAt, checkIn, checkOut, configured: isSupabaseConfigured }
}

// --- Squads ----------------------------------------------------------------

export function useSquads() {
  const { rows: squads, setRows: setSquads } = useRealtimeList<Squad>(fetchSquads, subscribeSquads)
  const {
    rows: members,
    setRows: setMembers,
    refresh: refreshMembers,
  } = useRealtimeList<SquadMember>(fetchSquadMembers, subscribeSquadMembers)

  const createSquad = useCallback(
    async (input: Parameters<typeof insertSquad>[0]) => {
      const { data, error } = await insertSquad(input)
      if (data) setSquads((prev) => [...prev, data])
      return { data, error }
    },
    [setSquads],
  )

  const joinSquad = useCallback(
    async (squadId: string, id: Identity): Promise<MutationResult> => {
      const optimistic: SquadMember = {
        squad_id: squadId,
        device_id: id.deviceId,
        name: id.name,
        joined_at: new Date().toISOString(),
      }
      // One squad per person: drop my other memberships first.
      setMembers((prev) => [...prev.filter((m) => m.device_id !== id.deviceId), optimistic])
      const { error } = await joinSquadRemote(squadId, id)
      if (error) refreshMembers()
      return { error }
    },
    [setMembers, refreshMembers],
  )

  const leaveSquad = useCallback(
    async (deviceId: string): Promise<MutationResult> => {
      setMembers((prev) => prev.filter((m) => m.device_id !== deviceId))
      const { error } = await leaveAllSquads(deviceId)
      if (error) refreshMembers()
      return { error }
    },
    [setMembers, refreshMembers],
  )

  const squadOf = useCallback(
    (deviceId: string) => members.find((m) => m.device_id === deviceId)?.squad_id ?? null,
    [members],
  )

  const membersOf = useCallback(
    (squadId: string) => members.filter((m) => m.squad_id === squadId),
    [members],
  )

  return {
    squads,
    members,
    createSquad,
    joinSquad,
    leaveSquad,
    squadOf,
    membersOf,
    configured: isSupabaseConfigured,
  }
}

// --- Photos ----------------------------------------------------------------

export function usePhotos() {
  const { rows, setRows, refresh } = useRealtimeList<Photo>(fetchPhotos, subscribePhotos)

  const upload = useCallback(
    async (file: Parameters<typeof uploadPhoto>[0], meta: Parameters<typeof uploadPhoto>[1]) => {
      const { data, error } = await uploadPhoto(file, meta)
      if (data) setRows((prev) => [data, ...prev])
      return { data, error }
    },
    [setRows],
  )

  const remove = useCallback(
    async (photo: Pick<Photo, 'id' | 'storage_path'>): Promise<MutationResult> => {
      setRows((prev) => prev.filter((p) => p.id !== photo.id))
      const { error } = await deletePhoto(photo)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  const photosFor = useCallback(
    (spotKey: string) => rows.filter((p) => p.spot_key === spotKey),
    [rows],
  )

  return { photos: rows, upload, remove, photosFor, configured: isSupabaseConfigured }
}

// --- Meetups ---------------------------------------------------------------

export function useMeetups() {
  const {
    rows: meetups,
    setRows: setMeetups,
    refresh: refreshMeetups,
  } = useRealtimeList<Meetup>(fetchMeetups, subscribeMeetups)
  const {
    rows: rsvps,
    setRows: setRsvps,
    refresh: refreshRsvps,
  } = useRealtimeList<MeetupRsvp>(fetchMeetupRsvps, subscribeMeetupRsvps)

  const createMeetup = useCallback(
    async (input: Parameters<typeof insertMeetup>[0]) => {
      const { data, error } = await insertMeetup(input)
      if (data) setMeetups((prev) => [...prev, data])
      return { data, error }
    },
    [setMeetups],
  )

  const cancelMeetup = useCallback(
    async (id: string): Promise<MutationResult> => {
      setMeetups((prev) => prev.map((m) => (m.id === id ? { ...m, cancelled: true } : m)))
      const { error } = await cancelMeetupRemote(id)
      if (error) refreshMeetups()
      return { error }
    },
    [setMeetups, refreshMeetups],
  )

  const rsvp = useCallback(
    async (meetupId: string, going: boolean, id: Identity): Promise<MutationResult> => {
      const optimistic: MeetupRsvp = {
        meetup_id: meetupId,
        device_id: id.deviceId,
        name: id.name,
        going,
      }
      setRsvps((prev) => [
        ...prev.filter((r) => !(r.meetup_id === meetupId && r.device_id === id.deviceId)),
        optimistic,
      ])
      const { error } = await upsertRsvp(meetupId, going, id)
      if (error) refreshRsvps()
      return { error }
    },
    [setRsvps, refreshRsvps],
  )

  const rsvpsFor = useCallback(
    (meetupId: string) => rsvps.filter((r) => r.meetup_id === meetupId),
    [rsvps],
  )

  return {
    meetups,
    rsvps,
    createMeetup,
    cancelMeetup,
    rsvp,
    rsvpsFor,
    configured: isSupabaseConfigured,
  }
}

// --- Attendees -------------------------------------------------------------

export function useAttendees() {
  const { rows, setRows, refresh } = useRealtimeList<AttendeeRow>(fetchAttendees, subscribeAttendees)

  const addAttendee = useCallback(
    async (input: Parameters<typeof insertAttendee>[0]) => {
      const { data, error } = await insertAttendee(input)
      if (data) setRows((prev) => [...prev, data])
      return { data, error }
    },
    [setRows],
  )

  const editAttendee = useCallback(
    async (id: string, patch: Parameters<typeof updateAttendee>[1]): Promise<MutationResult> => {
      setRows((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      const { error } = await updateAttendee(id, patch)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  const removeAttendee = useCallback(
    async (id: string): Promise<MutationResult> => {
      setRows((prev) => prev.filter((a) => a.id !== id))
      const { error } = await deleteAttendee(id)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  return { attendees: rows, addAttendee, editAttendee, removeAttendee, configured: isSupabaseConfigured }
}

// --- Schedule items --------------------------------------------------------

export function useScheduleItems() {
  const { rows, setRows, refresh } = useRealtimeList<ScheduleItemRow>(
    fetchScheduleItems,
    subscribeScheduleItems,
  )

  const addItem = useCallback(
    async (input: Parameters<typeof insertScheduleItem>[0]) => {
      const { data, error } = await insertScheduleItem(input)
      if (data) setRows((prev) => [...prev, data])
      return { data, error }
    },
    [setRows],
  )

  const editItem = useCallback(
    async (id: string, patch: Parameters<typeof updateScheduleItem>[1]): Promise<MutationResult> => {
      setRows((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
      const { error } = await updateScheduleItem(id, patch)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  const removeItem = useCallback(
    async (id: string): Promise<MutationResult> => {
      setRows((prev) => prev.filter((s) => s.id !== id))
      const { error } = await deleteScheduleItem(id)
      if (error) refresh()
      return { error }
    },
    [setRows, refresh],
  )

  return { items: rows, addItem, editItem, removeItem, configured: isSupabaseConfigured }
}
