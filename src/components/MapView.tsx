import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import { categoryColor, categoryOrder, venueKey, venues, type Venue, type VenueCategory } from '../data/venues'
import { colorForId, type LiveState } from '../lib/useLiveLocations'
import { useCheckins, useNameGate, useSquads, useVoteGate, type VotesApi } from '../lib/useSocial'
import type { Checkin } from '../lib/social'
import CheckInButton from './CheckInButton'
import SharePanel from './SharePanel'
import NamePrompt from './NamePrompt'

type CheckinsApi = ReturnType<typeof useCheckins>

const CENTER: [number, number] = [32.7108, -117.1605]

// Marker grows + glows with vote count; the visual is capped at 8 votes so a
// runaway favorite doesn't swallow the map.
const VOTE_CAP = 8

// Presence: only surface people whose open check-in is fresher than this.
const PRESENCE_MAX_AGE_MS = 4 * 60 * 60 * 1000

function venueIcon(category: VenueCategory, landmark: boolean, voteCount: number): L.DivIcon {
  const color = categoryColor[category]
  const capped = Math.min(voteCount, VOTE_CAP)
  const size = 16 + capped * 1.6 // 16 → ~29px
  const box = size + 10 // padding for the glow ring + count badge
  const badge = voteCount > 0 ? `<b class="pin-votes mono">${voteCount > 99 ? '99+' : voteCount}</b>` : ''
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin${landmark ? ' pin--landmark' : ''}${voteCount > 0 ? ' pin--voted' : ''}" style="--pin:${color};--pinv:${capped};--pinsz:${size}px">${badge}</span>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    popupAnchor: [0, -box / 2],
  })
}

function liveIcon(name: string, color: string, isMe: boolean): L.DivIcon {
  const initials = name.trim().slice(0, 2).toUpperCase() || '??'
  return L.divIcon({
    className: 'live-wrap',
    html: `<span class="live-dot${isMe ? ' live-dot--me' : ''}" style="--dot:${color}">
        <span class="live-ring"></span>
        <span class="live-core">${initials}</span>
        <span class="live-label">${escapeHtml(name)}${isMe ? ' · you' : ''}</span>
      </span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '??'
}

// One person shown at a spot's presence cluster.
type Person = { name: string; color: string; verified: boolean }

// Small avatar cluster that floats just above a spot's pin — up to three
// initials with a "+N" overflow chip. Interactivity comes from its popup.
function presenceIcon(people: Person[]): L.DivIcon {
  const shown = people.slice(0, 3)
  const extra = people.length - shown.length
  const avatars = shown
    .map((p) => `<span class="pres-av" style="--av:${p.color}">${escapeHtml(initials(p.name))}</span>`)
    .join('')
  const more = extra > 0 ? `<span class="pres-more">+${extra}</span>` : ''
  const w = 26 + shown.length * 15 + (extra > 0 ? 20 : 0)
  return L.divIcon({
    className: 'pres-wrap',
    html: `<span class="pres">${avatars}${more}</span>`,
    iconSize: [w, 28],
    iconAnchor: [w / 2, 44],
  })
}

function presencePopupHtml(spotName: string, people: Person[]): string {
  const items = people
    .map(
      (p) =>
        `<li><span class="pres-dot" style="--av:${p.color}"></span>${escapeHtml(p.name)}${p.verified ? '' : ' <span class="pres-nearby">nearby</span>'}</li>`,
    )
    .join('')
  return `<div class="pop">
    <div class="pop-cat mono">${people.length} checked in</div>
    <div class="pop-name">${escapeHtml(spotName)}</div>
    <ul class="pop-here">${items}</ul>
  </div>`
}

// The vote control rendered inside a popup — an HTML twin of <VoteButton>.
// Interactivity is handled by one delegated click listener on the map (below).
function voteHtml(spotKey: string, count: number, mine: boolean): string {
  return `<button type="button" class="votebtn votebtn--pop${mine ? ' votebtn--on' : ''}" data-votekey="${escapeHtml(spotKey)}" aria-pressed="${mine}" aria-label="${mine ? 'Remove your vote' : 'Upvote this spot'}">
      <span class="votebtn-heart" aria-hidden>${mine ? '♥' : '♡'}</span>
      <span class="votebtn-count mono">${count}</span>
    </button>`
}

function popupHtml(
  v: Venue,
  spotKey: string,
  count: number,
  mine: boolean,
  voteConfigured: boolean,
  checkinConfigured: boolean,
): string {
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`
  return `<div class="pop">
    <div class="pop-cat mono">${escapeHtml(v.category)}</div>
    <div class="pop-name">${escapeHtml(v.name)}</div>
    <div class="pop-notes">${escapeHtml(v.notes)}</div>
    ${v.schedule ? `<div class="pop-sched">📌 ${escapeHtml(v.schedule)}</div>` : ''}
    <div class="pop-actions">
      ${voteConfigured ? voteHtml(spotKey, count, mine) : ''}
      <a class="pop-dir" href="${dir}" target="_blank" rel="noopener">Directions ↗</a>
    </div>
    ${checkinConfigured ? '<div class="checkin-mount"></div>' : ''}
  </div>`
}

export default function MapView({
  live,
  votes,
  checkins,
}: {
  live: LiveState
  votes: VotesApi
  checkins: CheckinsApi
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const venueLayer = useRef<L.LayerGroup | null>(null)
  const presenceLayer = useRef<L.LayerGroup | null>(null)
  const liveLayer = useRef<L.LayerGroup | null>(null)
  const markers = useRef<Map<string, { marker: L.Marker; venue: Venue }>>(new Map())

  const [active, setActive] = useState<Set<VenueCategory>>(() => new Set(categoryOrder))
  const [topVoted, setTopVoted] = useState(false)
  // The venue whose popup is open + the DOM node to portal the check-in button
  // into. Cleared when the popup closes or the pin set is rebuilt.
  const [openPopup, setOpenPopup] = useState<{ key: string; venue: Venue; node: HTMLElement } | null>(null)

  const gate = useVoteGate(votes, live)
  const checkinGate = useNameGate(live)
  const squads = useSquads()
  const { countFor, hasMine, configured: voteConfigured } = votes

  const myOpen = checkins.openFor(live.myId)
  const mySquadId = squads.squadOf(live.myId)

  // Which venues are on the map right now. The "Top voted" lens shows every
  // spot with ≥1 vote regardless of category; otherwise the category chips rule.
  const visibleVenues = useMemo(() => {
    if (topVoted) return venues.filter((v) => countFor(venueKey(v)) > 0)
    return venues.filter((v) => active.has(v.category))
  }, [topVoted, active, countFor])

  // Membership signature — changes only when the *set* of visible pins changes,
  // so a mere vote-count bump doesn't tear down (and close) open popups.
  const membershipKey = useMemo(() => visibleVenues.map((v) => venueKey(v)).join('|'), [visibleVenues])
  // Count/mine signature — drives live in-place icon + open-popup updates.
  const voteSig = useMemo(
    () =>
      visibleVenues
        .map((v) => {
          const k = venueKey(v)
          return `${k}:${countFor(k)}:${hasMine(k) ? 1 : 0}`
        })
        .join('|'),
    [visibleVenues, countFor, hasMine],
  )

  // --- Presence: group fresh open check-ins by spot, resolve to coordinates ---
  const venueBySlug = useMemo(() => {
    const m = new Map<string, Venue>()
    for (const v of venues) m.set(v.slug, v)
    return m
  }, [])

  const presence = useMemo(() => {
    const now = Date.now()
    // Each person's single newest open+fresh check-in — one place per person,
    // even during the brief overlap while a move-to-a-new-spot reconciles.
    const currentByDevice = new Map<string, Checkin>()
    for (const c of checkins.checkins) {
      if (c.ended_at) continue
      if (now - new Date(c.created_at).getTime() >= PRESENCE_MAX_AGE_MS) continue
      const existing = currentByDevice.get(c.device_id)
      if (!existing || c.created_at > existing.created_at) currentByDevice.set(c.device_id, c)
    }
    const groups = new Map<string, Checkin[]>()
    for (const c of currentByDevice.values()) {
      const arr = groups.get(c.spot_key) ?? []
      arr.push(c)
      groups.set(c.spot_key, arr)
    }
    return groups
  }, [checkins.checkins])

  const presenceSig = useMemo(
    () =>
      [...presence.entries()]
        .map(([k, arr]) => `${k}:${arr.map((c) => c.device_id).sort().join(',')}`)
        .sort()
        .join('|'),
    [presence],
  )

  // Latest values for the imperative effects / listeners, kept in refs so the
  // effects don't need to re-run (and rebuild markers) on every render.
  const visibleRef = useRef(visibleVenues)
  visibleRef.current = visibleVenues
  const countForRef = useRef(countFor)
  countForRef.current = countFor
  const hasMineRef = useRef(hasMine)
  hasMineRef.current = hasMine
  const voteConfiguredRef = useRef(voteConfigured)
  voteConfiguredRef.current = voteConfigured
  const checkinConfiguredRef = useRef(checkins.configured)
  checkinConfiguredRef.current = checkins.configured
  const requestVoteRef = useRef(gate.request)
  requestVoteRef.current = gate.request
  const presenceRef = useRef(presence)
  presenceRef.current = presence
  const venueBySlugRef = useRef(venueBySlug)
  venueBySlugRef.current = venueBySlug

  // init map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      center: CENTER,
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: true,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)
    venueLayer.current = L.layerGroup().addTo(map)
    presenceLayer.current = L.layerGroup().addTo(map)
    liveLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // One delegated listener handles every popup's vote button, present or
    // future — popups live inside the map container so clicks bubble here.
    const el = mapEl.current
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest('[data-votekey]') as HTMLElement | null
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      const key = btn.getAttribute('data-votekey')
      if (key) requestVoteRef.current(key)
    }
    el.addEventListener('click', onClick)

    // Track which venue popup is open so we can portal the check-in button into
    // its mount node. Presence / live-dot popups have no mount and are ignored.
    const onPopupOpen = (e: L.PopupEvent) => {
      const node = e.popup.getElement()?.querySelector('.checkin-mount') as HTMLElement | null
      if (!node) return
      for (const [key, { marker, venue }] of markers.current) {
        if (marker.getPopup() === e.popup) {
          setOpenPopup({ key, venue, node })
          return
        }
      }
    }
    const onPopupClose = () => setOpenPopup(null)
    map.on('popupopen', onPopupOpen)
    map.on('popupclose', onPopupClose)

    return () => {
      el.removeEventListener('click', onClick)
      map.off('popupopen', onPopupOpen)
      map.off('popupclose', onPopupClose)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Rebuild pins only when the visible SET changes (filter / lens change).
  useEffect(() => {
    const layer = venueLayer.current
    if (!layer) return
    setOpenPopup(null) // any open popup closes when pins are rebuilt
    layer.clearLayers()
    markers.current.clear()
    for (const v of visibleRef.current) {
      const key = venueKey(v)
      const count = countForRef.current(key)
      const mine = hasMineRef.current(key)
      const marker = L.marker([v.lat, v.lng], {
        icon: venueIcon(v.category, !!v.landmark, count),
        title: v.name,
      })
        .bindPopup(popupHtml(v, key, count, mine, voteConfiguredRef.current, checkinConfiguredRef.current))
        .addTo(layer)
      markers.current.set(key, { marker, venue: v })
    }
  }, [membershipKey])

  // Live vote updates: rescale/glow each pin and refresh any open popup in
  // place — no teardown, so an open popup stays open while the count ticks.
  useEffect(() => {
    for (const [key, { marker, venue }] of markers.current) {
      const count = countForRef.current(key)
      const mine = hasMineRef.current(key)
      marker.setIcon(venueIcon(venue.category, !!venue.landmark, count))
      if (marker.isPopupOpen()) {
        marker.setPopupContent(
          popupHtml(venue, key, count, mine, voteConfiguredRef.current, checkinConfiguredRef.current),
        )
        // setPopupContent replaced the popup DOM (including the check-in mount);
        // re-point the portal at the fresh node so the button stays present.
        const node = marker.getPopup()?.getElement()?.querySelector('.checkin-mount') as HTMLElement | null
        if (node) setOpenPopup((prev) => (prev && prev.key === key ? { ...prev, node } : prev))
      }
    }
  }, [voteSig])

  // Presence avatars beside spots with fresh open check-ins.
  useEffect(() => {
    const layer = presenceLayer.current
    if (!layer) return
    layer.clearLayers()
    const bySlug = venueBySlugRef.current
    for (const [key, arr] of presenceRef.current) {
      const sample = arr[0]
      let coords: [number, number] | null = null
      let spotName = sample.spot_name || 'Spot'
      if (key.startsWith('venue:')) {
        const v = bySlug.get(key.slice('venue:'.length))
        if (v) {
          coords = [v.lat, v.lng]
          spotName = v.name
        }
      }
      if (!coords && sample.lat != null && sample.lng != null) coords = [sample.lat, sample.lng]
      if (!coords) continue
      const people: Person[] = arr.map((c) => ({
        name: c.name || 'Someone',
        color: colorForId(c.device_id),
        verified: c.verified,
      }))
      L.marker(coords, { icon: presenceIcon(people), zIndexOffset: 650 })
        .bindPopup(presencePopupHtml(spotName, people))
        .addTo(layer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceSig])

  // Leaving the Top-voted lens when the last vote is removed avoids a blank map.
  useEffect(() => {
    if (topVoted && votes.topKeys.length === 0) setTopVoted(false)
  }, [topVoted, votes.topKeys.length])

  // render live dots when they change
  const liveKey = useMemo(
    () =>
      [...live.others, ...(live.me ? [live.me] : [])]
        .map((l) => `${l.id}:${l.lat.toFixed(4)},${l.lng.toFixed(4)}`)
        .join('|'),
    [live.others, live.me],
  )
  useEffect(() => {
    const layer = liveLayer.current
    if (!layer) return
    layer.clearLayers()
    const dots = [...live.others]
    if (live.me) dots.push(live.me)
    dots.forEach((d) => {
      const isMe = d.id === live.myId
      L.marker([d.lat, d.lng], { icon: liveIcon(d.name, d.color, isMe), zIndexOffset: isMe ? 1000 : 500 })
        .bindPopup(`<div class="pop"><div class="pop-name">${escapeHtml(d.name)}${isMe ? ' (you)' : ''}</div><div class="pop-notes">Live location</div></div>`)
        .addTo(layer)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, live.myId])

  const toggle = (c: VenueCategory) => {
    setTopVoted(false)
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  const flyToMe = () => {
    if (live.me && mapRef.current) mapRef.current.flyTo([live.me.lat, live.me.lng], 16, { duration: 0.8 })
    else if (mapRef.current) mapRef.current.flyTo(CENTER, 15)
  }

  const allOn = active.size === categoryOrder.length && !topVoted

  return (
    <div className="mapview">
      <div className="mapview-bar">
        <div className="filterscroll">
          <button
            className={`chip chip--all${allOn ? ' chip--on' : ''}`}
            onClick={() => {
              setTopVoted(false)
              setActive(active.size === categoryOrder.length ? new Set() : new Set(categoryOrder))
            }}
          >
            {active.size === categoryOrder.length && !topVoted ? 'Clear' : 'All'}
          </button>
          {voteConfigured && votes.topKeys.length > 0 && (
            <button
              className={`chip chip--fav${topVoted ? ' chip--on' : ''}`}
              onClick={() => setTopVoted((t) => !t)}
              aria-pressed={topVoted}
            >
              <span className="chip-heart" aria-hidden>♥</span>
              Top voted
              <span className="chip-fav-count mono">{votes.topKeys.length}</span>
            </button>
          )}
          {categoryOrder.map((c) => (
            <button
              key={c}
              className={`chip${active.has(c) && !topVoted ? ' chip--on' : ''}`}
              style={{ ['--chip' as string]: categoryColor[c] }}
              onClick={() => toggle(c)}
              aria-pressed={active.has(c) && !topVoted}
            >
              <span className="chip-dot" />
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mapview-stage">
        <div ref={mapEl} className="leaflet-stage" role="application" aria-label="Map of San Diego venues and live attendee locations" />
        <SharePanel live={live} onRecenter={flyToMe} />
      </div>

      {openPopup &&
        createPortal(
          <CheckInButton
            spotKey={openPopup.key}
            spotName={openPopup.venue.name}
            lat={openPopup.venue.lat}
            lng={openPopup.venue.lng}
            deviceId={live.myId}
            myOpen={myOpen}
            squadId={mySquadId}
            checkIn={checkins.checkIn}
            checkOut={checkins.checkOut}
            requestName={checkinGate.request}
          />,
          openPopup.node,
        )}

      <NamePrompt open={gate.promptOpen} onSave={gate.resolve} onCancel={gate.cancel} />
      <NamePrompt
        open={checkinGate.promptOpen}
        onSave={checkinGate.resolve}
        onCancel={checkinGate.cancel}
        title="Who’s checking in?"
        lede="Pick your name so the crew knows who’s where. Saved on this device only."
        cta="Save & check in"
      />
    </div>
  )
}
