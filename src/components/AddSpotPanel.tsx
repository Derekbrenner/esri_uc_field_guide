import { useEffect, useState } from 'react'
import { categoryLabel, colorForCategory, spotCategoryOptions, type SpotCategory } from '../data/venues'

// ---------------------------------------------------------------------------
// AddSpotPanel (Phase 5). The bottom-sheet form for adding a user spot (drop a
// pin on the map or "use my location", then name + category + note) and for
// editing one you added. Pure UI: the map interaction (crosshair, tap-to-drop,
// the temp pin) and the DB writes live in MapView; this just collects fields.
// Identity attribution + the name-gate are handled by MapView on submit.
// ---------------------------------------------------------------------------

export type SpotFields = { name: string; category: SpotCategory; note: string }

type Props = {
  mode: 'add' | 'edit'
  // Prefill for edit; null (stable reference) for a fresh add.
  initial: SpotFields | null
  // The chosen drop point (add mode only). Null until the user taps / locates.
  point: { lat: number; lng: number } | null
  locating: boolean
  onUseMyLocation: () => void
  onSubmit: (fields: SpotFields) => void
  onClose: () => void
}

export default function AddSpotPanel({
  mode,
  initial,
  point,
  locating,
  onUseMyLocation,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<SpotCategory>(initial?.category ?? 'Lunch')
  const [note, setNote] = useState(initial?.note ?? '')

  // Reset the fields whenever we open a different spot (edit) or switch modes.
  // `initial` is a stable reference from MapView (memoized), so this doesn't
  // clobber typing on every render.
  useEffect(() => {
    setName(initial?.name ?? '')
    setCategory(initial?.category ?? 'Lunch')
    setNote(initial?.note ?? '')
  }, [initial, mode])

  const isEdit = mode === 'edit'
  const showForm = isEdit || point != null
  const canSave = name.trim().length > 0 && (isEdit || point != null)

  const submit = () => {
    if (!canSave) return
    onSubmit({ name: name.trim(), category, note: note.trim() })
  }

  return (
    <div className="addspot" role="dialog" aria-label={isEdit ? 'Edit spot' : 'Add a spot'}>
      <div className="addspot-head">
        <span className="section-eyebrow">{isEdit ? 'Edit your spot' : 'Add a spot'}</span>
        <button className="addspot-x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {!isEdit && (
        <div className="addspot-place">
          <p className="addspot-hint">
            {point
              ? 'Pin dropped. Tap the map to move it, or fill in the details.'
              : 'Tap the map to drop a pin, or use your location.'}
          </p>
          <button className="btn btn--ghost addspot-loc" onClick={onUseMyLocation} disabled={locating}>
            <span className={`ping ping--small${point ? ' ping--on' : ''}`} aria-hidden>
              <span className="ping-core" />
            </span>
            {locating ? 'Locating…' : point ? 'Use my location again' : 'Use my location'}
          </button>
        </div>
      )}

      {showForm && (
        <div className="addspot-form">
          <label className="share-label" htmlFor="spot-name">Name</label>
          <input
            id="spot-name"
            className="share-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cortez Cold Brew"
            maxLength={80}
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />

          <label className="share-label" htmlFor="spot-cat">Category</label>
          <div className="addspot-catwrap">
            <span className="addspot-catdot" style={{ background: colorForCategory(category) }} />
            <select
              id="spot-cat"
              className="share-input addspot-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as SpotCategory)}
            >
              {spotCategoryOptions.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <label className="share-label" htmlFor="spot-note">
            Note <span className="addspot-opt">optional</span>
          </label>
          <textarea
            id="spot-note"
            className="share-input addspot-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What’s good here?"
            maxLength={200}
            rows={2}
          />

          <div className="addspot-actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={submit} disabled={!canSave}>
              {isEdit ? 'Save changes' : 'Save spot'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
