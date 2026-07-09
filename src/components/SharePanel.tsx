import { useMemo, useState } from 'react'
import type { LiveState } from '../lib/useLiveLocations'
import { attendeeNames } from '../data/attendees'
import { useAttendees } from '../lib/useSocial'

export default function SharePanel({ live, onRecenter }: { live: LiveState; onRecenter: () => void }) {
  const [draft, setDraft] = useState(live.name)
  // Start collapsed on phones (map stays visible); open on larger screens.
  const [open, setOpen] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches),
  )

  // Name suggestions derive from the live, editable roster when Supabase is on;
  // otherwise fall back to the hardcoded crew list. Same UX either way — a
  // dropdown of crew names via <datalist>.
  const { configured: attendeesLive, attendees } = useAttendees()
  const nameOptions = useMemo(() => {
    if (attendeesLive && attendees.length) {
      const uniq = Array.from(new Set(attendees.map((a) => a.name.trim()).filter(Boolean)))
      const filtered = uniq.filter((n) => !/\+\d|Team|County/.test(n))
      if (filtered.length) return filtered
    }
    return attendeeNames
  }, [attendeesLive, attendees])

  const liveCount = live.liveCount
  const livePeople = live.people.filter((p) => p.live)
  const recentPeople = live.people.filter((p) => !p.live)

  return (
    <div className={`share${open ? '' : ' share--collapsed'}`}>
      <button className="share-handle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`ping ping--small${liveCount > 0 ? ' ping--on' : ''}`} aria-hidden>
          <span className="ping-core" />
        </span>
        <span className="share-handle-text">
          {live.sharing ? 'You’re on the map' : 'Share your location'}
        </span>
        <span className="share-count mono">{liveCount}</span>
        <span className="share-caret" aria-hidden>{open ? '▾' : '▴'}</span>
      </button>

      {open && (
        <div className="share-body">
          {!live.configured && (
            <p className="share-note">
              Live sharing isn’t connected yet. The map works — add Supabase keys to switch on live
              dots. See <span className="mono">SUPABASE_SETUP.md</span>.
            </p>
          )}

          {!live.sharing ? (
            <>
              <label className="share-label" htmlFor="who">Your name</label>
              <input
                id="who"
                className="share-input"
                list="crew-names"
                placeholder="Pick or type your name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
              />
              <datalist id="crew-names">
                {nameOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <button
                className="btn btn--primary share-go"
                onClick={() => live.start(draft)}
                disabled={!live.configured}
              >
                <span className="share-go-dot" /> Start sharing
              </button>
              <p className="share-fine">
                While you share, your dot updates live. Hit <strong>Stop sharing</strong> to vanish
                right away. If you just close the app, your last spot lingers — faded, labeled “last
                seen” — for up to a day. Only your name is saved on this device.
              </p>
            </>
          ) : (
            <>
              <div className="share-live">
                <span className="ping ping--small ping--on" aria-hidden><span className="ping-core" /></span>
                Sharing as <strong>{live.name || 'Someone'}</strong>
              </div>
              <div className="share-buttons">
                <button className="btn btn--ghost" onClick={onRecenter}>Center on me</button>
                <button className="btn btn--stop" onClick={live.stop}>Stop sharing</button>
              </div>
            </>
          )}

          {live.error && <p className="share-error">{live.error}</p>}

          {livePeople.length > 0 && (
            <ul className="share-roster">
              {livePeople.map((p) => (
                <li key={p.key}>
                  <span className="roster-dot" style={{ background: p.color }} />
                  {p.name}
                  {p.isMe && <span className="mono roster-you">you</span>}
                </li>
              ))}
            </ul>
          )}

          {recentPeople.length > 0 && (
            <>
              <p className="roster-head">Last seen</p>
              <ul className="share-roster share-roster--recent">
                {recentPeople.map((p) => (
                  <li key={p.key}>
                    <span className="roster-dot" style={{ background: p.color }} />
                    {p.name}
                    {p.isMe && <span className="mono roster-you">you</span>}
                    <span className="roster-seen mono">{p.seenLabel}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
