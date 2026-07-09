import { useEffect, useRef, useState } from 'react'
import type { Checkin, Squad, SquadMember } from '../lib/social'

const DISMISS_MS = 5_000
const MAX_VISIBLE = 4

type ToastKind = 'checkin' | 'squad'
type Toast = { id: string; text: string; kind: ToastKind }

// Ephemeral, self-dismissing notices fired when *other* people do something on
// the shared realtime streams: a check-in ("Erin checked in at Coin-Op …") or a
// squad join ("Derek joined 🗺️ Team Basemap"). Each event is toasted once
// (deduped), only if it landed after this component mounted and isn't the
// user's own — the mount gate suppresses the backlog on first load / reconnect.
export default function Toasts({
  checkins,
  members = [],
  squads = [],
  myId,
}: {
  checkins: Checkin[]
  members?: SquadMember[]
  squads?: Squad[]
  myId: string
}) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seen = useRef<Set<string>>(new Set())
  const mountedAt = useRef<number>(Date.now())
  const timers = useRef<number[]>([])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const push = (fresh: Toast[]) => {
    if (!fresh.length) return
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_VISIBLE))
    for (const t of fresh) {
      const timer = window.setTimeout(() => dismiss(t.id), DISMISS_MS)
      timers.current.push(timer)
    }
  }

  // Check-in toasts.
  useEffect(() => {
    const fresh: Toast[] = []
    for (const c of checkins) {
      const key = `c:${c.id}`
      if (seen.current.has(key)) continue
      seen.current.add(key)
      if (c.device_id === myId) continue // ignore own events
      if (new Date(c.created_at).getTime() < mountedAt.current) continue
      const pts = c.verified ? 10 : 3
      fresh.push({
        id: key,
        kind: 'checkin',
        text: `${c.name || 'Someone'} checked in at ${c.spot_name || 'a spot'} (+${pts})`,
      })
    }
    push(fresh)
  }, [checkins, myId])

  // Squad-join toasts (a create auto-joins the creator, so this covers both).
  // Depends on `squads` too, so a join that arrives before the squad list loads
  // still toasts once the squad resolves — its key stays unseen until emitted.
  useEffect(() => {
    const fresh: Toast[] = []
    for (const m of members) {
      // A rejoin updates joined_at, so key by it to allow a fresh toast.
      const key = `s:${m.squad_id}:${m.device_id}:${m.joined_at}`
      if (seen.current.has(key)) continue
      if (m.device_id === myId) {
        seen.current.add(key) // own join — never toast
        continue
      }
      if (!m.joined_at || new Date(m.joined_at).getTime() < mountedAt.current) {
        seen.current.add(key) // backlog from first load / reconnect
        continue
      }
      const squad = squads.find((s) => s.id === m.squad_id)
      if (!squad) continue // squad not loaded yet — retry on the next squads update
      seen.current.add(key)
      const badge = squad.emoji ? `${squad.emoji} ` : ''
      fresh.push({
        id: key,
        kind: 'squad',
        text: `${m.name || 'Someone'} joined ${badge}${squad.name}`,
      })
    }
    push(fresh)
  }, [members, squads, myId])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => window.clearTimeout(t))
  }, [])

  if (!toasts.length) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast--${t.kind}`}
          onClick={() => dismiss(t.id)}
        >
          <span className="toast-ico" aria-hidden>{t.kind === 'squad' ? '🚩' : '◎'}</span>
          <span className="toast-text">{t.text}</span>
        </button>
      ))}
    </div>
  )
}
