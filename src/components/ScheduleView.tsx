import { useMemo, useState } from 'react'
import { schedule } from '../data/schedule'
import { categoryOrder, venues, venueKey } from '../data/venues'
import { useScheduleItems, useNameGate, useMeetups } from '../lib/useSocial'
import type { Meetup, MeetupRsvp, ScheduleItemRow, Spot } from '../lib/social'
import { colorForId, type LiveState } from '../lib/useLiveLocations'
import { formatMeetupTime } from '../lib/points'
import NamePrompt from './NamePrompt'

const TODAY_ISO = '2026-07-09'

// The editable fields of a schedule item — what the add/edit form produces.
type Draft = {
  day: string | null
  time_label: string | null
  title: string
  note: string | null
  spot_key: string | null
}

type MeetupsApi = ReturnType<typeof useMeetups>

type ScheduleViewProps = {
  live: LiveState
  // The shared meetups stream — woven into the itinerary as special, highlighted
  // rows on their day so the crew can RSVP straight from the calendar.
  meetups: MeetupsApi
  // Fly the map to a linked spot (curated venue or user-added). Resolved in App
  // where the user-spots list lives; ScheduleView only offers keys it can resolve.
  onShowSpot: (spotKey: string) => void
  userSpots: Spot[]
}

// Itinerary. Editable + live when Supabase is configured (backed by the
// `schedule_items` table, seeded from src/data/schedule.ts). Falls back to the
// hardcoded, richly-grouped schedule when there's no backend.
export default function ScheduleView({ live, meetups, onShowSpot, userSpots }: ScheduleViewProps) {
  const { configured, items, addItem, editItem, removeItem } = useScheduleItems()
  // RSVPing from the calendar needs an identity, exactly like the map does.
  const rsvpGate = useNameGate(live)

  // Un-cancelled, dated meetups — grouped into the itinerary by their local day.
  const activeMeetups = useMemo(
    () => meetups.meetups.filter((m) => !m.cancelled && m.meet_at != null),
    [meetups.meetups],
  )

  // Resolve identity at action time (live.name can lag a just-saved name by a
  // render; the name-gate writes localStorage synchronously). Mirrors MapView.
  const identityNow = () => ({
    deviceId: live.myId,
    name: (live.name || localStorage.getItem('sdfg.name') || 'Someone').trim() || 'Someone',
  })
  const doRsvp = (meetupId: string, going: boolean) =>
    rsvpGate.request(() => meetups.rsvp(meetupId, going, identityNow()))
  const doCancelMeetup = (id: string) => {
    if (window.confirm('Cancel this meetup? It disappears for everyone.')) meetups.cancelMeetup(id)
  }

  if (!configured) return <ScheduleStatic />

  const editor = (live?.name || '').trim() || 'Someone'

  const add = async (d: Draft) => {
    const nextOrder = items.reduce((m, it) => Math.max(m, it.sort_order ?? 0), 0) + 1
    await addItem({ ...d, sort_order: nextOrder, updated_by: editor })
  }
  const edit = async (id: string, d: Draft) => {
    await editItem(id, { ...d, updated_by: editor, updated_at: new Date().toISOString() })
  }
  const remove = (id: string) => removeItem(id)

  return (
    <>
      <ScheduleEditable
        items={items}
        meetups={activeMeetups}
        rsvpsFor={meetups.rsvpsFor}
        myId={live.myId}
        onRsvp={doRsvp}
        onCancelMeetup={doCancelMeetup}
        userSpots={userSpots}
        add={add}
        edit={edit}
        remove={remove}
        onShowSpot={onShowSpot}
      />
      <NamePrompt
        open={rsvpGate.promptOpen}
        onSave={rsvpGate.resolve}
        onCancel={rsvpGate.cancel}
        title="Who’s RSVPing?"
        lede="Pick your name so the crew knows who’s in. Saved on this device only."
        cta="Save & RSVP"
      />
    </>
  )
}

// --------------------------------------------------------------------------
// Read-only fallback (unchanged behaviour, hardcoded data)
// --------------------------------------------------------------------------
function ScheduleStatic() {
  return (
    <section className="schedview">
      <header className="view-head">
        <p className="section-eyebrow">The week</p>
        <h1 className="view-title">Eight days, plotted.</h1>
        <p className="view-lede">
          Alex’s session picks plus the group plans. <span className="legend-group">Highlighted</span>{' '}
          blocks are group meetups and events.
        </p>
      </header>

      <ol className="days">
        {schedule.map((day) => {
          const isPast = day.iso < TODAY_ISO
          return (
            <li key={day.date} className={`day${isPast ? ' day--past' : ''}`}>
              <div className="day-rail">
                <span className="day-num mono">{day.date}</span>
                <span className="day-weekday">{day.weekday}</span>
              </div>

              <div className="day-body">
                {(day.arriving?.length || day.leaving?.length) && (
                  <div className="day-flights">
                    {day.arriving?.length ? (
                      <span className="flight flight--in">
                        <span className="flight-ico" aria-hidden>↓</span> Arriving:{' '}
                        {day.arriving.join(', ')}
                      </span>
                    ) : null}
                    {day.leaving?.length ? (
                      <span className="flight flight--out">
                        <span className="flight-ico" aria-hidden>↑</span> Leaving: {day.leaving.join(', ')}
                      </span>
                    ) : null}
                  </div>
                )}

                <div className="blocks">
                  {day.blocks.map((b, i) => (
                    <div key={i} className={`block${b.group ? ' block--group' : ''}`}>
                      <h3 className="block-title">
                        {b.group && <span className="block-star" aria-hidden>★</span>}
                        {b.title}
                      </h3>
                      <ul className="block-items">
                        {b.items.map((it, j) => (
                          <li key={j} className="block-item">
                            {it.time && <span className="block-time mono">{it.time}</span>}
                            <span className="block-text">
                              {it.text}
                              {it.detail && <span className="block-detail"> — {it.detail}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// --------------------------------------------------------------------------
// Live, editable itinerary
// --------------------------------------------------------------------------
type EditableProps = {
  items: ScheduleItemRow[]
  meetups: Meetup[]
  rsvpsFor: (meetupId: string) => MeetupRsvp[]
  myId: string
  onRsvp: (meetupId: string, going: boolean) => void
  onCancelMeetup: (id: string) => void
  userSpots: Spot[]
  add: (d: Draft) => Promise<void>
  edit: (id: string, d: Draft) => Promise<void>
  remove: (id: string) => Promise<{ error: string | null }> | Promise<void>
  onShowSpot: (spotKey: string) => void
}

function ScheduleEditable({
  items,
  meetups,
  rsvpsFor,
  myId,
  onRsvp,
  onCancelMeetup,
  userSpots,
  add,
  edit,
  remove,
  onShowSpot,
}: EditableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  // null = add form closed; object = open (with an optional preset day).
  const [addFor, setAddFor] = useState<{ day: string | null } | null>(null)

  const days = useMemo(() => groupByDay(items, meetups), [items, meetups])

  // Everything a linked spot_key can resolve to: curated venues + user spots
  // with coordinates. Drives both the "show on map" button and the picker.
  const spotIndex = useMemo(() => {
    const m = new Map<string, string>()
    venues.forEach((v) => m.set(venueKey(v), v.name))
    userSpots.forEach((s) => {
      if (s.lat != null && s.lng != null) m.set(s.id, s.name)
    })
    return m
  }, [userSpots])

  const linkableSpots = useMemo(
    () => userSpots.filter((s) => s.lat != null && s.lng != null),
    [userSpots],
  )

  return (
    <section className="schedview">
      <header className="view-head">
        <p className="section-eyebrow">The week</p>
        <h1 className="view-title">Eight days, plotted.</h1>
        <p className="view-lede">
          Live itinerary — anyone can add or edit. <span className="legend-meetup">Meetups</span> land on
          their day: RSVP right here.
        </p>
        {!addFor && (
          <button className="btn btn--ghost btn--sm crew-add" onClick={() => setAddFor({ day: null })}>
            + Add to schedule
          </button>
        )}
      </header>

      {addFor && (
        <div className="crew-add-panel">
          <ScheduleForm
            initialDay={addFor.day}
            linkableSpots={linkableSpots}
            onSave={async (d) => {
              await add(d)
              setAddFor(null)
            }}
            onCancel={() => setAddFor(null)}
          />
        </div>
      )}

      <ol className="days">
        {days.map((grp) => {
          const isPast = !!grp.day && grp.day < TODAY_ISO
          return (
            <li key={grp.day ?? 'tbd'} className={`day${isPast ? ' day--past' : ''}`}>
              <div className="day-rail">
                <span className="day-num mono">{grp.day ? fmtDate(grp.day) : 'TBD'}</span>
                <span className="day-weekday">{grp.day ? weekdayOf(grp.day) : 'Unscheduled'}</span>
              </div>

              <div className="day-body">
                <div className="block">
                  <ul className="block-items">
                    {grp.meetups.map((m) => (
                      <MeetupRow
                        key={m.id}
                        m={m}
                        rsvps={rsvpsFor(m.id)}
                        myId={myId}
                        spotIndex={spotIndex}
                        onRsvp={onRsvp}
                        onCancel={onCancelMeetup}
                        onShowSpot={onShowSpot}
                      />
                    ))}
                    {grp.items.map((it) =>
                      editingId === it.id ? (
                        <li key={it.id} className="block-item block-item--form">
                          <ScheduleForm
                            initial={it}
                            linkableSpots={linkableSpots}
                            onSave={async (d) => {
                              await edit(it.id, d)
                              setEditingId(null)
                            }}
                            onCancel={() => setEditingId(null)}
                            onRemove={async () => {
                              await remove(it.id)
                              setEditingId(null)
                            }}
                          />
                        </li>
                      ) : (
                        <li key={it.id} className="block-item sched-item">
                          {it.time_label && <span className="block-time mono">{it.time_label}</span>}
                          <span className="block-text">
                            {it.title}
                            {it.note && <span className="block-detail"> — {it.note}</span>}
                            {it.spot_key && spotIndex.has(it.spot_key) && (
                              <button
                                className="sched-map"
                                onClick={() => onShowSpot(it.spot_key!)}
                              >
                                <span aria-hidden>📍</span> Show on map
                              </button>
                            )}
                            {it.updated_by && it.updated_by !== 'seed' && (
                              <span className="sched-stamp mono">
                                · {it.updated_by}
                                {relTime(it.updated_at) && ` ${relTime(it.updated_at)}`}
                              </span>
                            )}
                          </span>
                          <button
                            className="crew-edit-btn"
                            onClick={() => setEditingId(it.id)}
                            aria-label={`Edit ${it.title}`}
                          >
                            Edit
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                  <button className="sched-add-item" onClick={() => setAddFor({ day: grp.day })}>
                    + Add item
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// --------------------------------------------------------------------------
// Meetup row — a meetup woven into a day, highlighted as special, with the same
// RSVP + cancel controls the map banner offers so nobody has to leave the plan.
// --------------------------------------------------------------------------
function MeetupRow({
  m,
  rsvps,
  myId,
  spotIndex,
  onRsvp,
  onCancel,
  onShowSpot,
}: {
  m: Meetup
  rsvps: MeetupRsvp[]
  myId: string
  spotIndex: Map<string, string>
  onRsvp: (meetupId: string, going: boolean) => void
  onCancel: (id: string) => void
  onShowSpot: (spotKey: string) => void
}) {
  const going = rsvps.filter((r) => r.going)
  const mine = rsvps.find((r) => r.device_id === myId)
  const isCreator = m.created_by_device === myId
  const time = formatMeetupTime(m.meet_at)
  const canShowOnMap = !!m.spot_key && spotIndex.has(m.spot_key)

  return (
    <li className="block-item sched-meetup">
      <div className="sched-meetup-head">
        {time && <span className="block-time mono sched-meetup-time">{time}</span>}
        <span className="sched-meetup-tag">🕐 Meetup</span>
        {mine?.going === true && <span className="sched-meetup-yourein">You’re in</span>}
      </div>

      <div className="sched-meetup-main">
        <span className="block-text">
          {m.spot_name || 'Meetup'}
          {m.note && <span className="block-detail"> — {m.note}</span>}
          {canShowOnMap && (
            <button className="sched-map" onClick={() => onShowSpot(m.spot_key!)}>
              <span aria-hidden>📍</span> Show on map
            </button>
          )}
        </span>
        <span className="sched-meetup-by mono">by {m.created_by_name || 'Someone'}</span>
      </div>

      <div className="sched-meetup-foot">
        <span className="meetupcard-avs" aria-hidden>
          {going.length === 0 ? (
            <span className="meetupcard-nogo mono">No RSVPs yet</span>
          ) : (
            <>
              {going.slice(0, 5).map((r) => (
                <span
                  key={r.device_id}
                  className="meetup-av"
                  style={{ ['--av' as string]: colorForId(r.device_id) }}
                  title={r.name || 'Someone'}
                >
                  {initials(r.name)}
                </span>
              ))}
              {going.length > 5 && <span className="meetup-avmore">+{going.length - 5}</span>}
            </>
          )}
        </span>
        <span className="meetupcard-rsvp">
          <button
            type="button"
            className={`meetup-in${mine?.going === true ? ' meetup-in--on' : ''}`}
            onClick={() => onRsvp(m.id, true)}
          >
            I’m in
          </button>
          <button
            type="button"
            className={`meetup-out-btn${mine?.going === false ? ' meetup-out-btn--on' : ''}`}
            onClick={() => onRsvp(m.id, false)}
          >
            Can’t
          </button>
        </span>
      </div>

      {isCreator && (
        <button
          type="button"
          className="meetupcard-cancel sched-meetup-cancel"
          onClick={() => onCancel(m.id)}
        >
          Cancel meetup
        </button>
      )}
    </li>
  )
}

// --------------------------------------------------------------------------
// Add / edit form (shared)
// --------------------------------------------------------------------------
function ScheduleForm({
  initial,
  initialDay,
  linkableSpots,
  onSave,
  onCancel,
  onRemove,
}: {
  initial?: ScheduleItemRow
  initialDay?: string | null
  linkableSpots: Spot[]
  onSave: (d: Draft) => void | Promise<void>
  onCancel: () => void
  onRemove?: () => void | Promise<void>
}) {
  const [day, setDay] = useState(toDateInput(initial?.day ?? initialDay ?? null))
  const [time, setTime] = useState(initial?.time_label ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [spot, setSpot] = useState(initial?.spot_key ?? '')
  const [busy, setBusy] = useState(false)

  const canSave = title.trim().length > 0

  const submit = async () => {
    if (!canSave || busy) return
    setBusy(true)
    await onSave({
      day: day || null,
      time_label: time.trim() || null,
      title: title.trim(),
      note: note.trim() || null,
      spot_key: spot || null,
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
          <span className="efield-label">Title</span>
          <input
            className="einput"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session, dinner, meetup…"
            autoFocus
          />
        </label>
        <label className="efield">
          <span className="efield-label">Day</span>
          <input className="einput" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="efield">
          <span className="efield-label">Time</span>
          <input
            className="einput"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="6:00 PM / 8:30–10:00"
          />
        </label>
        <label className="efield efield--wide">
          <span className="efield-label">Note</span>
          <input
            className="einput"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Detail, group, reserve spot…"
          />
        </label>
        <label className="efield efield--wide">
          <span className="efield-label">Linked spot (optional)</span>
          <select className="einput" value={spot} onChange={(e) => setSpot(e.target.value)}>
            <option value="">No linked spot</option>
            {categoryOrder.map((cat) => {
              const list = venues.filter((v) => v.category === cat)
              if (!list.length) return null
              return (
                <optgroup key={cat} label={cat}>
                  {list.map((v) => (
                    <option key={v.slug} value={venueKey(v)}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
            {linkableSpots.length > 0 && (
              <optgroup label="Added spots">
                {linkableSpots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
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
type DayGroup = { day: string | null; items: ScheduleItemRow[]; meetups: Meetup[] }

// Merge schedule items and meetups into one per-day timeline. Items sort by their
// stored order; meetups by their start time. Days with only a meetup still show.
function groupByDay(items: ScheduleItemRow[], meetups: Meetup[]): DayGroup[] {
  const NULL_KEY = '~' // ASCII after digits, so undated items sort to the end
  const itemMap = new Map<string, ScheduleItemRow[]>()
  for (const it of items) {
    const key = it.day ?? NULL_KEY
    if (!itemMap.has(key)) itemMap.set(key, [])
    itemMap.get(key)!.push(it)
  }
  const meetMap = new Map<string, Meetup[]>()
  for (const m of meetups) {
    const key = localDayOf(m.meet_at) ?? NULL_KEY
    if (!meetMap.has(key)) meetMap.set(key, [])
    meetMap.get(key)!.push(m)
  }
  const keys = new Set<string>([...itemMap.keys(), ...meetMap.keys()])
  return Array.from(keys)
    .sort()
    .map((k) => ({
      day: k === NULL_KEY ? null : k,
      items: (itemMap.get(k) ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      meetups: (meetMap.get(k) ?? [])
        .slice()
        .sort((a, b) => (a.meet_at ?? '').localeCompare(b.meet_at ?? '')),
    }))
}

// The local calendar day (YYYY-MM-DD) a meetup's start time falls on — matches
// the day a creator picked in the local-time datetime picker.
function localDayOf(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function initials(name: string | null | undefined): string {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${+m[2]}/${+m[3]}` : iso
}

function weekdayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

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
