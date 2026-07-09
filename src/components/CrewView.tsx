import { useMemo, useState } from 'react'
import { crew } from '../data/attendees'
import { useAttendees } from '../lib/useSocial'
import type { AttendeeRow } from '../lib/social'
import type { LiveState } from '../lib/useLiveLocations'

// The editable fields of an attendee — what the add/edit form produces.
type Draft = {
  name: string
  org: string | null
  group_size: number | null
  arrive_date: string | null
  depart_date: string | null
  note: string | null
}

// Crew roster. When Supabase is configured the list is live + editable (backed
// by the `attendees` table, seeded from src/data/attendees.ts). With no backend
// it falls back to the hardcoded roster, read-only — exactly as before.
export default function CrewView({ live }: { live: LiveState }) {
  const { configured, attendees, addAttendee, editAttendee, removeAttendee } = useAttendees()

  if (!configured) return <CrewStatic />

  // Edits are attributed to the shared identity (localStorage name).
  const editor = (live?.name || '').trim() || 'Someone'

  const add = async (d: Draft) => {
    const nextOrder = attendees.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0) + 1
    await addAttendee({ ...d, sort_order: nextOrder, updated_by: editor })
  }
  const edit = async (id: string, d: Draft) => {
    // Stamp updated_at optimistically so the "edited by … · just now" line is
    // correct immediately; updateAttendee re-stamps it server-side too.
    await editAttendee(id, { ...d, updated_by: editor, updated_at: new Date().toISOString() })
  }
  const remove = (id: string) => removeAttendee(id)

  return <CrewEditable rows={attendees} add={add} edit={edit} remove={remove} />
}

// --------------------------------------------------------------------------
// Read-only fallback (unchanged behaviour, hardcoded data)
// --------------------------------------------------------------------------
function CrewStatic() {
  const total = crew.reduce((n, g) => n + g.people.length, 0)
  return (
    <section className="crewview">
      <header className="view-head">
        <p className="section-eyebrow">Who’s in town</p>
        <h1 className="view-title">The crew — {total}+ strong.</h1>
        <p className="view-lede">Arrival and departure dates from the trip doc. “?” means still TBD.</p>
      </header>

      <div className="crew-groups">
        {crew.map((g) => (
          <div key={g.group} className="crew-group">
            <div className="crew-group-head">
              <h2>{g.group}</h2>
              <span className="mono crew-count">{g.people.length}</span>
            </div>
            <ul className="crew-list">
              {g.people.map((p, i) => (
                <li key={p.name + i} className="crew-row">
                  <span className="crew-name">
                    {p.name}
                    {p.note && <span className="crew-tag">{p.note}</span>}
                  </span>
                  <span className="crew-dates mono">
                    <span className="crew-in">{p.arrival ?? '?'}</span>
                    <span className="crew-arrow" aria-hidden>→</span>
                    <span className="crew-out">{p.departure ?? '?'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------
// Live, editable roster
// --------------------------------------------------------------------------
type EditableProps = {
  rows: AttendeeRow[]
  add: (d: Draft) => Promise<void>
  edit: (id: string, d: Draft) => Promise<void>
  remove: (id: string) => Promise<{ error: string | null }> | Promise<void>
}

function CrewEditable({ rows, add, edit, remove }: EditableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const groups = useMemo(() => groupByOrg(rows), [rows])
  const orgs = useMemo(
    () => Array.from(new Set(rows.map((r) => (r.org ?? '').trim()).filter(Boolean))),
    [rows],
  )
  const total = rows.reduce((n, r) => n + Math.max(1, r.group_size ?? 1), 0)

  return (
    <section className="crewview">
      <header className="view-head">
        <p className="section-eyebrow">Who’s in town</p>
        <h1 className="view-title">The crew — {total}+ strong.</h1>
        <p className="view-lede">
          Live roster — anyone can edit. Tap a name to update arrival/departure or add a note.
        </p>
        {!adding && (
          <button className="btn btn--ghost btn--sm crew-add" onClick={() => setAdding(true)}>
            + Add crew member
          </button>
        )}
      </header>

      {adding && (
        <div className="crew-add-panel">
          <AttendeeForm
            orgs={orgs}
            onSave={async (d) => {
              await add(d)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <div className="crew-groups">
        {groups.map((g) => (
          <div key={g.org} className="crew-group">
            <div className="crew-group-head">
              <h2>{g.org}</h2>
              <span className="mono crew-count">{g.people.length}</span>
            </div>
            <ul className="crew-list">
              {g.people.map((p) =>
                editingId === p.id ? (
                  <li key={p.id} className="crew-row crew-row--form">
                    <AttendeeForm
                      initial={p}
                      orgs={orgs}
                      onSave={async (d) => {
                        await edit(p.id, d)
                        setEditingId(null)
                      }}
                      onCancel={() => setEditingId(null)}
                      onRemove={async () => {
                        await remove(p.id)
                        setEditingId(null)
                      }}
                    />
                  </li>
                ) : (
                  <li key={p.id} className="crew-row crew-row--edit">
                    <div className="crew-row-main">
                      <span className="crew-name">
                        {p.name}
                        {p.group_size != null && p.group_size > 1 && (
                          <span className="crew-tag">party of {p.group_size}</span>
                        )}
                        {p.note && <span className="crew-tag">{p.note}</span>}
                      </span>
                      <span className="crew-dates mono">
                        <span className="crew-in">{fmtDate(p.arrive_date)}</span>
                        <span className="crew-arrow" aria-hidden>→</span>
                        <span className="crew-out">{fmtDate(p.depart_date)}</span>
                      </span>
                      <button
                        className="crew-edit-btn"
                        onClick={() => setEditingId(p.id)}
                        aria-label={`Edit ${p.name}`}
                      >
                        Edit
                      </button>
                    </div>
                    {p.updated_by && p.updated_by !== 'seed' && (
                      <div className="crew-stamp mono">
                        edited by {p.updated_by}
                        {relTime(p.updated_at) && ` · ${relTime(p.updated_at)}`}
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------
// Add / edit form (shared)
// --------------------------------------------------------------------------
function AttendeeForm({
  initial,
  orgs,
  onSave,
  onCancel,
  onRemove,
}: {
  initial?: AttendeeRow
  orgs: string[]
  onSave: (d: Draft) => void | Promise<void>
  onCancel: () => void
  onRemove?: () => void | Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [org, setOrg] = useState(initial?.org ?? '')
  const [groupSize, setGroupSize] = useState(String(initial?.group_size ?? 1))
  const [arrive, setArrive] = useState(toDateInput(initial?.arrive_date ?? null))
  const [depart, setDepart] = useState(toDateInput(initial?.depart_date ?? null))
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)

  const canSave = name.trim().length > 0

  const submit = async () => {
    if (!canSave || busy) return
    setBusy(true)
    const parsed = parseInt(groupSize, 10)
    await onSave({
      name: name.trim(),
      org: org.trim() || null,
      group_size: Number.isFinite(parsed) && parsed > 1 ? parsed : 1,
      arrive_date: arrive || null,
      depart_date: depart || null,
      note: note.trim() || null,
    })
    setBusy(false)
  }

  return (
    <form
      className="eform"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="eform-grid">
        <label className="efield efield--wide">
          <span className="efield-label">Name</span>
          <input
            className="einput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoFocus
          />
        </label>
        <label className="efield efield--wide">
          <span className="efield-label">Group / org</span>
          <input
            className="einput"
            list="crew-orgs"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="e.g. Public Works"
          />
          <datalist id="crew-orgs">
            {orgs.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <label className="efield">
          <span className="efield-label">Party size</span>
          <input
            className="einput"
            type="number"
            min={1}
            value={groupSize}
            onChange={(e) => setGroupSize(e.target.value)}
          />
        </label>
        <label className="efield">
          <span className="efield-label">Arrives</span>
          <input className="einput" type="date" value={arrive} onChange={(e) => setArrive(e.target.value)} />
        </label>
        <label className="efield">
          <span className="efield-label">Departs</span>
          <input className="einput" type="date" value={depart} onChange={(e) => setDepart(e.target.value)} />
        </label>
        <label className="efield efield--wide">
          <span className="efield-label">Note</span>
          <input
            className="einput"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sheriff, TBC, …"
          />
        </label>
      </div>
      <div className="eform-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={!canSave || busy}>
          Save
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {onRemove && (
          <button
            type="button"
            className="btn btn--stop btn--sm eform-remove"
            onClick={() => onRemove()}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  )
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------
function groupByOrg(rows: AttendeeRow[]): { org: string; people: AttendeeRow[] }[] {
  const order: string[] = []
  const map = new Map<string, AttendeeRow[]>()
  for (const r of rows) {
    const key = (r.org ?? '').trim() || 'Crew'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(r)
  }
  return order.map((org) => ({ org, people: map.get(org)! }))
}

// ISO ('YYYY-MM-DD') → 'M/D' for display; passes through anything else; '?' when null.
function fmtDate(v: string | null): string {
  if (!v) return '?'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (m) return `${+m[2]}/${+m[3]}`
  return v
}

// Value for <input type="date"> — wants 'YYYY-MM-DD' or ''.
function toDateInput(v: string | null): string {
  if (!v) return ''
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1] : ''
}

function relTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
