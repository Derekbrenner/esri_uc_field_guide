import { useState } from 'react'
import { attendeeNames } from '../data/attendees'

// Shared name picker, reused wherever a social action needs an identity but the
// user hasn't set one yet (Phase 2: voting). Same dropdown-of-crew + freeform
// datalist pattern as SharePanel — it does not change the name-entry UX.
export default function NamePrompt({
  open,
  onSave,
  onCancel,
}: {
  open: boolean
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState('')
  if (!open) return null

  const save = () => {
    if (draft.trim()) onSave(draft.trim())
  }

  return (
    <div className="nameprompt-backdrop" onClick={onCancel}>
      <div
        className="nameprompt"
        role="dialog"
        aria-modal="true"
        aria-label="Set your name"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="section-eyebrow">One quick thing</p>
        <h2 className="nameprompt-title">Who’s voting?</h2>
        <p className="nameprompt-lede">
          Pick your name so the crew knows whose favorites are whose. Saved on this device only.
        </p>
        <label className="share-label" htmlFor="vote-name">Your name</label>
        <input
          id="vote-name"
          className="share-input"
          list="vote-crew-names"
          placeholder="Pick or type your name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          autoComplete="off"
          autoFocus
        />
        <datalist id="vote-crew-names">
          {attendeeNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="nameprompt-actions">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={!draft.trim()}>
            Save &amp; vote
          </button>
        </div>
      </div>
    </div>
  )
}
