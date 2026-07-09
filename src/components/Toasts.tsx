import { useEffect, useRef, useState } from 'react'
import type { Checkin } from '../lib/social'

const DISMISS_MS = 5_000
const MAX_VISIBLE = 4

type Toast = { id: string; text: string }

// Ephemeral, self-dismissing notices fired when *other* people check in. Driven
// off the shared realtime check-in list: a check-in is toasted once (deduped by
// id) if it was created after this component mounted and isn't the user's own.
export default function Toasts({ checkins, myId }: { checkins: Checkin[]; myId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seen = useRef<Set<string>>(new Set())
  const mountedAt = useRef<number>(Date.now())
  const timers = useRef<number[]>([])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  useEffect(() => {
    const fresh: Toast[] = []
    for (const c of checkins) {
      if (seen.current.has(c.id)) continue
      seen.current.add(c.id)
      if (c.device_id === myId) continue // ignore own events
      // Suppress the backlog that arrives on first load / reconnect.
      if (new Date(c.created_at).getTime() < mountedAt.current) continue
      const pts = c.verified ? 10 : 3
      fresh.push({
        id: c.id,
        text: `${c.name || 'Someone'} checked in at ${c.spot_name || 'a spot'} (+${pts})`,
      })
    }
    if (!fresh.length) return
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_VISIBLE))
    for (const t of fresh) {
      const timer = window.setTimeout(() => dismiss(t.id), DISMISS_MS)
      timers.current.push(timer)
    }
  }, [checkins, myId])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => window.clearTimeout(t))
  }, [])

  if (!toasts.length) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className="toast" onClick={() => dismiss(t.id)}>
          <span className="toast-ico" aria-hidden>◎</span>
          <span className="toast-text">{t.text}</span>
        </button>
      ))}
    </div>
  )
}
