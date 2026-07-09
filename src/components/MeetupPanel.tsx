import { useState } from 'react'
import type { Squad } from '../lib/social'

// ---------------------------------------------------------------------------
// MeetupPanel (Phase 7). The bottom-sheet form for planning a meetup — reached
// from a spot popup ("Plan meetup here", location + name fixed) or by dropping a
// pin on the map (name is free, location is the dropped point / your location).
// Pure UI: the map interaction (crosshair, tap-to-drop, the temp pin) and the DB
// write live in MapView; this just collects the fields. Identity attribution +
// the name-gate are handled by MapView on submit. MapView remounts this per
// context (via `key`), so all state seeds straight from props.
// ---------------------------------------------------------------------------

export type MeetupFields = {
  spotName: string
  meetAt: string // ISO string
  note: string
  squadId: string | null
}

type Props = {
  // From a spot popup: the spot's name + coords are locked. From a dropped pin:
  // false, so the user names the spot and picks a point.
  fixedSpot: boolean
  spotName: string // prefill (the spot name, or '' for a free drop)
  point: { lat: number; lng: number } | null // chosen location; null until dropped
  locating: boolean
  squads: Squad[]
  onUseMyLocation: () => void
  onSubmit: (fields: MeetupFields) => void
  onClose: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

// A datetime-local input value (YYYY-MM-DDTHH:MM) in *local* time.
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

// The next :00 / :30 boundary from now (San Diego is a whole-hour offset, so
// rounding epoch ms to a 30-min grid lands on a local half-hour).
function nextHalfHour(): Date {
  const step = 30 * 60 * 1000
  return new Date(Math.ceil(Date.now() / step) * step)
}

export default function MeetupPanel({
  fixedSpot,
  spotName,
  point,
  locating,
  squads,
  onUseMyLocation,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(spotName)
  const [when, setWhen] = useState(() => toLocalInputValue(nextHalfHour()))
  const [note, setNote] = useState('')
  const [squadId, setSquadId] = useState('')

  const canSave = name.trim().length > 0 && when.length > 0 && point != null

  const submit = () => {
    if (!canSave) return
    const d = new Date(when) // datetime-local parses as local time
    if (Number.isNaN(d.getTime())) return
    onSubmit({
      spotName: name.trim(),
      meetAt: d.toISOString(),
      note: note.trim(),
      squadId: squadId || null,
    })
  }

  return (
    <div className="addspot meetuppanel" role="dialog" aria-label="Plan a meetup">
      <div className="addspot-head">
        <span className="section-eyebrow">Plan a meetup</span>
        <button className="addspot-x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {!fixedSpot && (
        <div className="addspot-place">
          <p className="addspot-hint">
            {point
              ? 'Pin dropped. Tap the map to move it, or fill in the details.'
              : 'Tap the map to set the spot, or use your location.'}
          </p>
          <button className="btn btn--ghost addspot-loc" onClick={onUseMyLocation} disabled={locating}>
            <span className={`ping ping--small${point ? ' ping--on' : ''}`} aria-hidden>
              <span className="ping-core" />
            </span>
            {locating ? 'Locating…' : point ? 'Use my location again' : 'Use my location'}
          </button>
        </div>
      )}

      <div className="addspot-form">
        <label className="share-label" htmlFor="meetup-name">Meeting spot</label>
        {fixedSpot ? (
          <div className="meetup-spotname">{name || 'This spot'}</div>
        ) : (
          <input
            id="meetup-name"
            className="share-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Waterfront Park"
            maxLength={80}
            autoComplete="off"
          />
        )}

        <label className="share-label" htmlFor="meetup-when">When</label>
        <input
          id="meetup-when"
          type="datetime-local"
          className="share-input meetup-when"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />

        {squads.length > 0 && (
          <>
            <label className="share-label" htmlFor="meetup-squad">
              Who <span className="addspot-opt">optional</span>
            </label>
            <div className="addspot-catwrap">
              <select
                id="meetup-squad"
                className="share-input meetup-squadsel"
                value={squadId}
                onChange={(e) => setSquadId(e.target.value)}
              >
                <option value="">Everyone</option>
                {squads.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji ? `${s.emoji} ` : ''}
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <label className="share-label" htmlFor="meetup-note">
          Note <span className="addspot-opt">optional</span>
        </label>
        <textarea
          id="meetup-note"
          className="share-input addspot-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. grabbing a table on the patio"
          maxLength={200}
          rows={2}
        />

        <div className="addspot-actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={!canSave}>
            Plan meetup
          </button>
        </div>
      </div>
    </div>
  )
}
