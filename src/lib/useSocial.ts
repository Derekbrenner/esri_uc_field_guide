import { useCallback, useEffect, useState } from 'react'
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

export function useVotes() {
  const { rows, setRows, refresh } = useRealtimeList<Vote>(fetchVotes, subscribeVotes)

  const countFor = useCallback(
    (spotKey: string) => rows.reduce((n, v) => (v.spot_key === spotKey ? n + 1 : n), 0),
    [rows],
  )

  const hasVoted = useCallback(
    (spotKey: string, deviceId: string) =>
      rows.some((v) => v.spot_key === spotKey && v.device_id === deviceId),
    [rows],
  )

  const toggleVote = useCallback(
    async (spotKey: string, id: Identity): Promise<MutationResult> => {
      const voted = rows.some((v) => v.spot_key === spotKey && v.device_id === id.deviceId)
      if (voted) {
        setRows((prev) =>
          prev.filter((v) => !(v.spot_key === spotKey && v.device_id === id.deviceId)),
        )
        const { error } = await removeVote(spotKey, id.deviceId)
        if (error) refresh()
        return { error }
      }
      const optimistic: Vote = {
        spot_key: spotKey,
        device_id: id.deviceId,
        name: id.name,
        created_at: new Date().toISOString(),
      }
      setRows((prev) => [...prev, optimistic])
      const { error } = await addVote(spotKey, id)
      if (error) refresh()
      return { error }
    },
    [rows, setRows, refresh],
  )

  return { votes: rows, countFor, hasVoted, toggleVote, configured: isSupabaseConfigured }
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
