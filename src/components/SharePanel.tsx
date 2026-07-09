import { useState } from 'react'
import type { LiveState } from '../lib/useLiveLocations'
import { attendeeNames } from '../data/attendees'

export default function SharePanel({ live, onRecenter }: { live: LiveState; onRecenter: () => void }) {
  const [draft, setDraft] = useState(live.name)
  const [open, setOpen] = useState(true)

  const liveCount = live.others.length + (live.me ? 1 : 0)

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
                {attendeeNames.map((n) => (
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
                Your location is stored only while you’re sharing and disappears 15 minutes after you
                stop. Nothing is saved to your device beyond your name.
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

          {liveCount > 0 && (
            <ul className="share-roster">
              {live.me && (
                <li>
                  <span className="roster-dot" style={{ background: live.me.color }} />
                  {live.me.name} <span className="mono roster-you">you</span>
                </li>
              )}
              {live.others.map((o) => (
                <li key={o.id}>
                  <span className="roster-dot" style={{ background: o.color }} />
                  {o.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
