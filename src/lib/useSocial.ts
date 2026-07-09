import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from './supabase'
import { addVote, fetchVotes, removeVote, subscribeVotes, type Vote } from './social'

// ---------------------------------------------------------------------------
// Per-domain hooks for the social layer. Each does an initial fetch + realtime
// subscription + optimistic local update, mirroring `useLiveLocations`. They
// all return empty / inert values when Supabase isn't configured, so the UI can
// render nothing without special-casing. Phase 2 ships `useVotes`; later phases
// add `useCheckins`, `useSquads`, `usePhotos`, `useMeetups`, etc. here.
// ---------------------------------------------------------------------------

const ID_KEY = 'sdfg.deviceId'
const NAME_KEY = 'sdfg.name'
const POLL_MS = 30_000

function getDeviceId(): string {
  let id = localStorage.getItem(ID_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'id-' + Math.random().toString(36).slice(2)
    localStorage.setItem(ID_KEY, id)
  }
  return id
}

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
  const myId = useRef<string>(isSupabaseConfigured ? getDeviceId() : '').current
  const [rows, setRows] = useState<Vote[]>([])
  const rowsRef = useRef<Vote[]>(rows)
  rowsRef.current = rows

  const refresh = useCallback(async () => {
    const data = await fetchVotes()
    setRows(data)
  }, [])

  // Initial fetch + realtime subscribe + slow poll safety net.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    refresh()
    const unsub = subscribeVotes(refresh)
    const poll = window.setInterval(refresh, POLL_MS)
    return () => {
      unsub()
      window.clearInterval(poll)
    }
  }, [refresh])

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

      // Optimistic: reflect the tap immediately, reconcile from the server after.
      if (had) {
        setRows(current.filter((r) => !(r.spot_key === spotKey && r.device_id === myId)))
      } else {
        const name = (localStorage.getItem(NAME_KEY) || 'Someone').trim()
        setRows([
          ...current,
          { spot_key: spotKey, device_id: myId, name, created_at: new Date().toISOString() },
        ])
      }

      const run = async () => {
        if (had) {
          await removeVote(spotKey, myId)
        } else {
          const name = (localStorage.getItem(NAME_KEY) || 'Someone').trim()
          await addVote({ spot_key: spotKey, device_id: myId, name })
        }
        // Reconcile with the server once the write lands. This confirms a
        // success and rolls back a failed optimistic change to the real state.
        refresh()
      }
      run()
    },
    [myId, refresh],
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
// Reuses the existing identity (localStorage name via `live.setName`) — no new
// name-entry UX. `live` only needs the name + setter from `useLiveLocations`.
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
