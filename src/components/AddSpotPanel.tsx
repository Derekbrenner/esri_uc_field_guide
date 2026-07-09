import { useEffect, useRef, useState } from 'react'
import { categoryLabel, colorForCategory, spotCategoryOptions, type SpotCategory } from '../data/venues'
import { isShortMapLink, parseLatLng, type LatLng } from '../lib/points'

// ---------------------------------------------------------------------------
// AddSpotPanel (Phase 5). The bottom-sheet form for adding a user spot and for
// editing one you added. The location can come from a map pin (MapView owns the
// crosshair + tap-to-drop), "use my location", or — when `allowLink` is set — a
// pasted Google Maps link / raw coordinates parsed right here. The DB writes and
// identity attribution happen in the host (MapView / FoodView) on submit; this
// just collects fields and reports a parsed point up via `onSetPoint`.
// ---------------------------------------------------------------------------

export type SpotFields = { name: string; category: SpotCategory; note: string }

type Props = {
  mode: 'add' | 'edit'
  // Prefill for edit; null (stable reference) for a fresh add.
  initial: SpotFields | null
  // The chosen location (add mode). Null until the user taps / locates / pastes.
  point: LatLng | null
  locating: boolean
  onUseMyLocation: () => void
  onSubmit: (fields: SpotFields) => void
  onClose: () => void
  // Which categories the picker offers. Defaults to the full set (curated +
  // POI); the Food tab passes just the food categories so a food spot can only
  // land in a current category.
  categories?: SpotCategory[]
  // Eyebrow label for add mode (e.g. "Add a food spot").
  heading?: string
  // Show a "paste a Google Maps link / coordinates" field that sets the point.
  allowLink?: boolean
  // Report a location parsed from the link field back to the host.
  onSetPoint?: (pt: LatLng) => void
  // 'map' = the absolutely-positioned panel on the map; 'modal' = a centered
  // card (used inside a backdrop in the Food tab, where there's no map to tap).
  variant?: 'map' | 'modal'
}

type LinkNote = { text: string; bad: boolean }

export default function AddSpotPanel({
  mode,
  initial,
  point,
  locating,
  onUseMyLocation,
  onSubmit,
  onClose,
  categories = spotCategoryOptions,
  heading,
  allowLink = false,
  onSetPoint,
  variant = 'map',
}: Props) {
  // Default to Lunch when it's offered (nicest first guess for food), else the
  // first category in the list.
  const defaultCat: SpotCategory = categories.includes('Lunch') ? 'Lunch' : categories[0]
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<SpotCategory>(initial?.category ?? defaultCat)
  const [note, setNote] = useState(initial?.note ?? '')
  const [linkText, setLinkText] = useState('')
  const [linkNote, setLinkNote] = useState<LinkNote | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const linkRef = useRef<HTMLInputElement>(null)
  const nameFocused = useRef(false)

  // Reset the fields whenever we open a different spot (edit) or switch modes.
  // `initial` is a stable reference from the host (memoized / literal null), so
  // this doesn't clobber typing on every render.
  useEffect(() => {
    setName(initial?.name ?? '')
    setCategory(initial?.category ?? defaultCat)
    setNote(initial?.note ?? '')
    setLinkText('')
    setLinkNote(null)
    // defaultCat derives from `categories`; both are stable per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, mode])

  const isEdit = mode === 'edit'
  const showForm = isEdit || point != null
  const canSave = name.trim().length > 0 && (isEdit || point != null)

  // Focus the Name field once the form appears — but never yank the caret away
  // from the location field the user is still typing into (parsing coordinates
  // fires as they type, so the form can appear mid-keystroke). Replaces a plain
  // autoFocus on Name, which would steal focus in exactly that case.
  useEffect(() => {
    if (!showForm) {
      nameFocused.current = false
      return
    }
    if (nameFocused.current) return
    if (document.activeElement === linkRef.current) return
    nameFocused.current = true
    nameRef.current?.focus()
  }, [showForm])

  const submit = () => {
    if (!canSave) return
    onSubmit({ name: name.trim(), category, note: note.trim() })
  }

  // Parse the pasted link / coordinates on every change and report a hit up.
  const onLinkChange = (v: string) => {
    setLinkText(v)
    const trimmed = v.trim()
    if (!trimmed) {
      setLinkNote(null)
      return
    }
    const pt = parseLatLng(trimmed)
    if (pt) {
      onSetPoint?.(pt)
      setLinkNote({ text: `Location set · ${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`, bad: false })
    } else if (isShortMapLink(trimmed)) {
      setLinkNote({
        text: 'That short link doesn’t include the spot. Open it in Google Maps, then paste the full URL (it has “@lat,long”) — or paste coordinates.',
        bad: true,
      })
    } else {
      setLinkNote({ text: 'Paste a full Google Maps URL, or “lat, long” coordinates.', bad: true })
    }
  }

  const placeHint = point
    ? variant === 'modal'
      ? 'Location set — fill in the details below.'
      : 'Pin dropped. Tap the map to move it, or fill in the details.'
    : variant === 'modal'
      ? 'Paste a Google Maps link (or coordinates), or use your location.'
      : allowLink
        ? 'Tap the map to drop a pin, paste a Google Maps link, or use your location.'
        : 'Tap the map to drop a pin, or use your location.'

  return (
    <div
      className={`addspot${variant === 'modal' ? ' addspot--modal' : ''}`}
      role="dialog"
      aria-label={isEdit ? 'Edit spot' : heading ?? 'Add a spot'}
    >
      <div className="addspot-head">
        <span className="section-eyebrow">{isEdit ? 'Edit your spot' : heading ?? 'Add a spot'}</span>
        <button className="addspot-x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {!isEdit && (
        <div className="addspot-place">
          <p className="addspot-hint">{placeHint}</p>

          {allowLink && (
            <div className="addspot-link">
              <label className="share-label" htmlFor="spot-loc">Location</label>
              <input
                ref={linkRef}
                id="spot-loc"
                className="share-input"
                value={linkText}
                onChange={(e) => onLinkChange(e.target.value)}
                placeholder="Google Maps link or 32.71, -117.16"
                autoComplete="off"
                spellCheck={false}
                // Focus the paste field on open in the modal (Food tab), where
                // pasting a location is the first thing to do. On the map we
                // leave focus free so the keyboard doesn't cover the map.
                autoFocus={variant === 'modal'}
              />
              {linkNote && (
                <p className={`addspot-locnote${linkNote.bad ? ' addspot-locnote--bad' : ''}`}>
                  {linkNote.text}
                </p>
              )}
            </div>
          )}

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
            ref={nameRef}
            id="spot-name"
            className="share-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cortez Cold Brew"
            maxLength={80}
            autoComplete="off"
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
              {categories.map((c) => (
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
