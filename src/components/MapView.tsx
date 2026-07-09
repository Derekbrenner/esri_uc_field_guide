import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import {
  categoryColor,
  categoryOrder,
  colorForCategory,
  poiColor,
  spotCategoryOptions,
  venueKey,
  venues,
  type SpotCategory,
} from '../data/venues'
import { colorForId, type LiveState } from '../lib/useLiveLocations'
import {
  useCheckins,
  useNameGate,
  usePhotos,
  useSpots,
  useSquads,
  useVoteGate,
  type VotesApi,
} from '../lib/useSocial'
import { photoUrl, type Checkin, type Photo } from '../lib/social'
import { squadLocation } from '../lib/points'
import CheckInButton from './CheckInButton'
import PhotoUpload from './PhotoUpload'
import AddSpotPanel, { type SpotFields } from './AddSpotPanel'
import SharePanel from './SharePanel'
import NamePrompt from './NamePrompt'

type CheckinsApi = ReturnType<typeof useCheckins>
type PhotosApi = ReturnType<typeof usePhotos>
type SpotsApi = ReturnType<typeof useSpots>
type SquadsApi = ReturnType<typeof useSquads>

// A curated venue OR a user-added spot, normalized into one shape so every pin,
// popup, vote, check-in, and photo path treats them identically. `spotKey` is
// the vote/check-in/photo key: 'venue:<slug>' for venues, the DB uuid for
// user-added spots.
type MapSpot = {
  spotKey: string
  name: string
  category: SpotCategory
  notes: string
  schedule?: string
  lat: number
  lng: number
  landmark: boolean
  userAdded: boolean
  addedByName: string | null
  addedByDevice: string | null
}

// Where "Show on map" flies to. `at` is a nonce so re-picking the same spot
// re-fires the effect.
export type MapFocus = { lat: number; lng: number; at: number }

const CENTER: [number, number] = [32.7108, -117.1605]

// The category lens covers every curated category plus the POI catch-all that
// user spots can carry.
const ALL_CATS: SpotCategory[] = spotCategoryOptions

// Marker grows + glows with vote count; the visual is capped at 8 votes so a
// runaway favorite doesn't swallow the map.
const VOTE_CAP = 8

// Presence: only surface people whose open check-in is fresher than this.
const PRESENCE_MAX_AGE_MS = 4 * 60 * 60 * 1000

// Strip characters that could break out of a CSS url('…') context. Supabase
// public URLs never contain these, but keep the DivIcon HTML safe regardless.
function cssUrl(url: string): string {
  return url.replace(/[\\'")]/g, '')
}

function spotIcon(s: MapSpot, voteCount: number, thumbUrl?: string): L.DivIcon {
  const color = colorForCategory(s.category)
  const capped = Math.min(voteCount, VOTE_CAP)
  const size = 16 + capped * 1.6 // 16 → ~29px
  const box = size + 10 // padding for the glow ring + count badge
  const badge = voteCount > 0 ? `<b class="pin-votes mono">${voteCount > 99 ? '99+' : voteCount}</b>` : ''
  const photo = thumbUrl ? `<i class="pin-photo" style="background-image:url('${cssUrl(thumbUrl)}')"></i>` : ''
  const cls = [
    'pin',
    s.landmark ? 'pin--landmark' : '',
    s.userAdded ? 'pin--user' : '',
    voteCount > 0 ? 'pin--voted' : '',
    thumbUrl ? 'pin--photo' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="${cls}" style="--pin:${color};--pinv:${capped};--pinsz:${size}px">${badge}${photo}</span>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    popupAnchor: [0, -box / 2],
  })
}

// The transient "drop point" marker shown while placing a new spot.
function draftIcon(): L.DivIcon {
  return L.divIcon({
    className: 'draftpin-wrap',
    html: `<span class="draftpin"><span class="draftpin-core"></span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

// Tiny framed-thumbnail marker for a coordinate-only photo (spot_key null).
function photoMarkerIcon(url: string): L.DivIcon {
  return L.divIcon({
    className: 'photopin-wrap',
    html: `<span class="photopin"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  })
}

function photoMarkerPopupHtml(p: Photo, url: string): string {
  return `<div class="pop pop--photo">
    <a class="pop-photo" href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${escapeHtml(p.caption || 'Photo')}" /></a>
    ${p.caption ? `<div class="pop-notes">${escapeHtml(p.caption)}</div>` : ''}
    <div class="pop-cat mono">by ${escapeHtml(p.name || 'Someone')}</div>
  </div>`
}

// The photo strip + upload control portaled into a spot popup's .photo-mount.
// A live React child, so the strip refreshes as photos arrive.
function SpotPhotos({
  spotKey,
  lat,
  lng,
  photos,
  deviceId,
  upload,
  requestName,
}: {
  spotKey: string
  lat: number
  lng: number
  photos: Photo[]
  deviceId: string
  upload: PhotosApi['upload']
  requestName: (action: () => void) => void
}) {
  return (
    <div className="spotphotos">
      {photos.length > 0 && (
        <div className="spotphotos-strip">
          {photos.map((p) => {
            const url = photoUrl(p.storage_path)
            return (
              <a
                key={p.id}
                className="spotphotos-thumb"
                href={url}
                target="_blank"
                rel="noopener"
                title={p.caption || `Photo by ${p.name || 'someone'}`}
              >
                <img src={url} alt={p.caption || `Photo by ${p.name || 'someone'}`} loading="lazy" />
              </a>
            )
          })}
        </div>
      )}
      <PhotoUpload
        spotKey={spotKey}
        lat={lat}
        lng={lng}
        deviceId={deviceId}
        upload={upload}
        requestName={requestName}
        variant="inline"
      />
    </div>
  )
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
  s: MapSpot,
  count: number,
  mine: boolean,
  voteConfigured: boolean,
  checkinConfigured: boolean,
  photoConfigured: boolean,
  canEdit: boolean,
): string {
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  const catLabel = s.category === 'poi' ? 'Point of interest' : s.category
  return `<div class="pop">
    <div class="pop-cat mono">${escapeHtml(catLabel)}${s.userAdded ? ' · field note' : ''}</div>
    <div class="pop-name">${escapeHtml(s.name)}</div>
    ${s.notes ? `<div class="pop-notes">${escapeHtml(s.notes)}</div>` : ''}
    ${s.schedule ? `<div class="pop-sched">📌 ${escapeHtml(s.schedule)}</div>` : ''}
    ${s.userAdded && s.addedByName ? `<div class="pop-added mono">added by ${escapeHtml(s.addedByName)}</div>` : ''}
    <div class="pop-actions">
      ${voteConfigured ? voteHtml(s.spotKey, count, mine) : ''}
      <a class="pop-dir" href="${dir}" target="_blank" rel="noopener">Directions ↗</a>
    </div>
    ${checkinConfigured ? '<div class="checkin-mount"></div>' : ''}
    ${photoConfigured ? '<div class="photo-mount"></div>' : ''}
    ${
      canEdit
        ? `<div class="pop-owner">
      <button type="button" class="pop-edit" data-editspot="${escapeHtml(s.spotKey)}">Edit</button>
      <button type="button" class="pop-delete" data-deletespot="${escapeHtml(s.spotKey)}">Delete</button>
    </div>`
        : ''
    }
  </div>`
}

export default function MapView({
  live,
  votes,
  checkins,
  photos,
  spots,
  squads,
  focus,
  onFocusConsumed,
  onOpenSquads,
}: {
  live: LiveState
  votes: VotesApi
  checkins: CheckinsApi
  photos: PhotosApi
  spots: SpotsApi
  squads: SquadsApi
  focus?: MapFocus | null
  onFocusConsumed?: () => void
  onOpenSquads?: () => void
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const venueLayer = useRef<L.LayerGroup | null>(null)
  const presenceLayer = useRef<L.LayerGroup | null>(null)
  const photoLayer = useRef<L.LayerGroup | null>(null)
  const liveLayer = useRef<L.LayerGroup | null>(null)
  const draftMarker = useRef<L.Marker | null>(null)
  const markers = useRef<Map<string, { marker: L.Marker; spot: MapSpot }>>(new Map())

  const [active, setActive] = useState<Set<SpotCategory>>(() => new Set(ALL_CATS))
  const [topVoted, setTopVoted] = useState(false)
  // Squad legend: collapsible list of squads + where each group is. Starts
  // collapsed on small screens (keep the map clear), open on larger ones.
  const [legendOpen, setLegendOpen] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches),
  )
  // Add-spot mode: crosshair cursor, tap-to-drop, the placement sheet.
  const [addMode, setAddMode] = useState(false)
  const [draftPoint, setDraftPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  // The user's own spot currently being edited (from its popup), or null.
  const [editingSpot, setEditingSpot] = useState<MapSpot | null>(null)
  // The venue whose popup is open + the DOM nodes to portal the check-in button
  // and photo strip into. Cleared when the popup closes or pins are rebuilt.
  const [openPopup, setOpenPopup] = useState<{
    key: string
    spot: MapSpot
    checkinNode: HTMLElement | null
    photoNode: HTMLElement | null
  } | null>(null)

  const gate = useVoteGate(votes, live)
  const checkinGate = useNameGate(live)
  const photoGate = useNameGate(live)
  const spotGate = useNameGate(live)
  const { countFor, hasMine, configured: voteConfigured } = votes

  const myOpen = checkins.openFor(live.myId)
  const mySquadId = squads.squadOf(live.myId)

  // Ownership test for edit/delete affordances (adder only).
  const myIdRef = useRef(live.myId)
  myIdRef.current = live.myId
  const canEditSpot = (s: MapSpot) => s.userAdded && s.addedByDevice === myIdRef.current

  // --- Merge curated venues with user-added spots into one pin model ---------
  const venueSpots = useMemo<MapSpot[]>(
    () =>
      venues.map((v) => ({
        spotKey: venueKey(v),
        name: v.name,
        category: v.category,
        notes: v.notes,
        schedule: v.schedule,
        lat: v.lat,
        lng: v.lng,
        landmark: !!v.landmark,
        userAdded: false,
        addedByName: null,
        addedByDevice: null,
      })),
    [],
  )

  const userSpots = useMemo<MapSpot[]>(
    () =>
      spots.spots
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({
          spotKey: s.id,
          name: s.name,
          category: (s.category as SpotCategory) || 'poi',
          notes: s.note ?? '',
          schedule: undefined,
          lat: s.lat as number,
          lng: s.lng as number,
          landmark: false,
          userAdded: true,
          addedByName: s.added_by_name,
          addedByDevice: s.added_by_device,
        })),
    [spots.spots],
  )

  const allSpots = useMemo(() => [...venueSpots, ...userSpots], [venueSpots, userSpots])

  const spotByKey = useMemo(() => {
    const m = new Map<string, MapSpot>()
    for (const s of allSpots) m.set(s.spotKey, s)
    return m
  }, [allSpots])

  // Which spots are on the map right now. The "Top voted" lens shows every spot
  // with ≥1 vote regardless of category; otherwise the category chips rule.
  const visibleSpots = useMemo(() => {
    if (topVoted) return allSpots.filter((s) => countFor(s.spotKey) > 0)
    return allSpots.filter((s) => active.has(s.category))
  }, [topVoted, active, countFor, allSpots])

  // Membership signature — changes when the *set* of visible pins changes (or a
  // user spot's own content / location changes), so a mere vote-count bump
  // doesn't tear down open popups, but an edited spot does rebuild.
  const membershipKey = useMemo(
    () =>
      visibleSpots
        .map((s) =>
          s.userAdded ? `${s.spotKey}@${s.lat},${s.lng}#${s.name}#${s.category}#${s.notes}` : s.spotKey,
        )
        .join('|'),
    [visibleSpots],
  )
  // Count/mine signature — drives live in-place icon + open-popup updates.
  const voteSig = useMemo(
    () =>
      visibleSpots
        .map((s) => `${s.spotKey}:${countFor(s.spotKey)}:${hasMine(s.spotKey) ? 1 : 0}`)
        .join('|'),
    [visibleSpots, countFor, hasMine],
  )

  // --- Photos: group by spot (newest-first — photos arrive desc by created) ---
  const photosBySpot = useMemo(() => {
    const m = new Map<string, Photo[]>()
    for (const p of photos.photos) {
      if (!p.spot_key) continue
      const arr = m.get(p.spot_key) ?? []
      arr.push(p)
      m.set(p.spot_key, arr)
    }
    return m
  }, [photos.photos])

  // Photo-badge signature — changes when a visible pin gains/loses photos or its
  // newest (thumbnail) photo changes, so we can refresh just the icons.
  const photoSig = useMemo(
    () =>
      visibleSpots
        .map((s) => {
          const arr = photosBySpot.get(s.spotKey)
          return `${s.spotKey}:${arr && arr.length ? `${arr.length}_${arr[0].id}` : '0'}`
        })
        .join('|'),
    [visibleSpots, photosBySpot],
  )

  // Coordinate-only photos (no spot) become their own tiny markers.
  const coordPhotos = useMemo(
    () => photos.photos.filter((p) => !p.spot_key && p.lat != null && p.lng != null),
    [photos.photos],
  )
  const coordPhotoSig = useMemo(() => coordPhotos.map((p) => p.id).join('|'), [coordPhotos])

  // Coordinates to stamp on a "photo here" while checked in — the spot's own
  // location for a known spot, else the GPS fix recorded at check-in.
  const myOpenCoords = useMemo(() => {
    if (!myOpen) return null
    const s = spotByKey.get(myOpen.spot_key)
    if (s) return { lat: s.lat, lng: s.lng }
    return myOpen.lat != null && myOpen.lng != null ? { lat: myOpen.lat, lng: myOpen.lng } : null
  }, [myOpen, spotByKey])

  // Each person's single newest open+fresh check-in — one place per person,
  // even during the brief overlap while a move-to-a-new-spot reconciles. Shared
  // by the presence clusters and the squad legend's "where's the group" logic.
  const currentByDevice = useMemo(() => {
    const now = Date.now()
    const m = new Map<string, Checkin>()
    for (const c of checkins.checkins) {
      if (c.ended_at) continue
      if (now - new Date(c.created_at).getTime() >= PRESENCE_MAX_AGE_MS) continue
      const existing = m.get(c.device_id)
      if (!existing || c.created_at > existing.created_at) m.set(c.device_id, c)
    }
    return m
  }, [checkins.checkins])

  const presence = useMemo(() => {
    const groups = new Map<string, Checkin[]>()
    for (const c of currentByDevice.values()) {
      const arr = groups.get(c.spot_key) ?? []
      arr.push(c)
      groups.set(c.spot_key, arr)
    }
    return groups
  }, [currentByDevice])

  const presenceSig = useMemo(
    () =>
      [...presence.entries()]
        .map(([k, arr]) => `${k}:${arr.map((c) => c.device_id).sort().join(',')}`)
        .sort()
        .join('|'),
    [presence],
  )

  // Squad legend rows: each squad, its members, and where the group is right now
  // — the spot a majority of its checked-in members share (else "scattered").
  const squadLegend = useMemo(() => {
    return squads.squads.map((sq) => {
      const members = squads.membersOf(sq.id)
      const openKeys: string[] = []
      for (const m of members) {
        const oc = currentByDevice.get(m.device_id)
        if (oc) openKeys.push(oc.spot_key)
      }
      const locKey = squadLocation(openKeys)
      let coords: { lat: number; lng: number } | null = null
      let locLabel: string
      if (locKey) {
        const spot = spotByKey.get(locKey)
        if (spot) {
          coords = { lat: spot.lat, lng: spot.lng }
          locLabel = spot.name
        } else {
          // Unknown spot_key (e.g. a since-removed spot): use a member's stamp.
          const oc = [...currentByDevice.values()].find((c) => c.spot_key === locKey)
          if (oc && oc.lat != null && oc.lng != null) coords = { lat: oc.lat, lng: oc.lng }
          locLabel = oc?.spot_name || 'a spot'
        }
      } else {
        locLabel = openKeys.length > 0 ? 'Scattered' : 'No check-ins yet'
      }
      return { squad: sq, members, coords, locLabel, checkedIn: openKeys.length }
    })
  }, [squads.squads, squads.members, currentByDevice, spotByKey])

  // Latest values for the imperative effects / listeners, kept in refs so the
  // effects don't need to re-run (and rebuild markers) on every render.
  const visibleRef = useRef(visibleSpots)
  visibleRef.current = visibleSpots
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
  const spotByKeyRef = useRef(spotByKey)
  spotByKeyRef.current = spotByKey
  const photoConfiguredRef = useRef(photos.configured)
  photoConfiguredRef.current = photos.configured
  const photosBySpotRef = useRef(photosBySpot)
  photosBySpotRef.current = photosBySpot
  const coordPhotosRef = useRef(coordPhotos)
  coordPhotosRef.current = coordPhotos
  const removeSpotRef = useRef(spots.removeSpot)
  removeSpotRef.current = spots.removeSpot

  // Build a spot's marker icon from the *current* vote count + newest photo
  // thumbnail (both read via refs, so the imperative effects stay in sync).
  const makeIcon = (s: MapSpot): L.DivIcon => {
    const arr = photosBySpotRef.current.get(s.spotKey)
    const thumb = arr && arr.length ? photoUrl(arr[0].storage_path) : ''
    return spotIcon(s, countForRef.current(s.spotKey), thumb || undefined)
  }

  // Leave add/edit flow and clear any transient placement state.
  const closeSpotFlow = () => {
    setAddMode(false)
    setEditingSpot(null)
    setDraftPoint(null)
    setLocating(false)
  }

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
    photoLayer.current = L.layerGroup().addTo(map)
    presenceLayer.current = L.layerGroup().addTo(map)
    liveLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // One delegated listener handles every popup's vote button + a user spot's
    // edit / delete buttons, present or future — popups live inside the map
    // container so clicks bubble here.
    const el = mapEl.current
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const voteBtn = target.closest('[data-votekey]') as HTMLElement | null
      if (voteBtn) {
        e.preventDefault()
        e.stopPropagation()
        const key = voteBtn.getAttribute('data-votekey')
        if (key) requestVoteRef.current(key)
        return
      }
      const editBtn = target.closest('[data-editspot]') as HTMLElement | null
      if (editBtn) {
        e.preventDefault()
        e.stopPropagation()
        const key = editBtn.getAttribute('data-editspot')
        const s = key ? spotByKeyRef.current.get(key) : null
        if (s) {
          mapRef.current?.closePopup()
          setAddMode(false)
          setDraftPoint(null)
          setEditingSpot(s)
        }
        return
      }
      const delBtn = target.closest('[data-deletespot]') as HTMLElement | null
      if (delBtn) {
        e.preventDefault()
        e.stopPropagation()
        const key = delBtn.getAttribute('data-deletespot')
        const s = key ? spotByKeyRef.current.get(key) : null
        if (s && window.confirm(`Delete “${s.name}”? This removes it for everyone.`)) {
          mapRef.current?.closePopup()
          removeSpotRef.current(s.spotKey)
        }
        return
      }
    }
    el.addEventListener('click', onClick)

    // Track which venue popup is open so we can portal the check-in button +
    // photo strip into its mount nodes. Presence / live-dot / photo-marker
    // popups have no mounts and are ignored.
    const onPopupOpen = (e: L.PopupEvent) => {
      const root = e.popup.getElement()
      const checkinNode = (root?.querySelector('.checkin-mount') as HTMLElement | null) ?? null
      const photoNode = (root?.querySelector('.photo-mount') as HTMLElement | null) ?? null
      if (!checkinNode && !photoNode) return
      for (const [key, { marker, spot }] of markers.current) {
        if (marker.getPopup() === e.popup) {
          setOpenPopup({ key, spot, checkinNode, photoNode })
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

  // Add mode: crosshair cursor + tap-to-drop. Bound only while placing a spot.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !addMode) return
    const container = map.getContainer()
    container.classList.add('leaflet-adding')
    const onMapClick = (e: L.LeafletMouseEvent) => {
      setDraftPoint({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
    map.on('click', onMapClick)
    return () => {
      container.classList.remove('leaflet-adding')
      map.off('click', onMapClick)
    }
  }, [addMode])

  // The transient drop-point marker follows draftPoint while in add mode.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (draftMarker.current) {
      map.removeLayer(draftMarker.current)
      draftMarker.current = null
    }
    if (addMode && draftPoint) {
      draftMarker.current = L.marker([draftPoint.lat, draftPoint.lng], {
        icon: draftIcon(),
        zIndexOffset: 900,
        interactive: false,
        keyboard: false,
      }).addTo(map)
    }
  }, [addMode, draftPoint])

  // Rebuild pins only when the visible SET (or a user spot's content) changes.
  useEffect(() => {
    const layer = venueLayer.current
    if (!layer) return
    setOpenPopup(null) // any open popup closes when pins are rebuilt
    layer.clearLayers()
    markers.current.clear()
    for (const s of visibleRef.current) {
      const key = s.spotKey
      const marker = L.marker([s.lat, s.lng], {
        icon: makeIcon(s),
        title: s.name,
      })
        .bindPopup(
          popupHtml(
            s,
            countForRef.current(key),
            hasMineRef.current(key),
            voteConfiguredRef.current,
            checkinConfiguredRef.current,
            photoConfiguredRef.current,
            canEditSpot(s),
          ),
        )
        .addTo(layer)
      markers.current.set(key, { marker, spot: s })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipKey])

  // Live vote updates: rescale/glow each pin and refresh any open popup in
  // place — no teardown, so an open popup stays open while the count ticks.
  useEffect(() => {
    for (const [key, { marker, spot }] of markers.current) {
      marker.setIcon(makeIcon(spot))
      if (marker.isPopupOpen()) {
        marker.setPopupContent(
          popupHtml(
            spot,
            countForRef.current(key),
            hasMineRef.current(key),
            voteConfiguredRef.current,
            checkinConfiguredRef.current,
            photoConfiguredRef.current,
            canEditSpot(spot),
          ),
        )
        // setPopupContent replaced the popup DOM (including the mounts); re-point
        // the portals at the fresh nodes so the controls stay present.
        const root = marker.getPopup()?.getElement()
        const checkinNode = (root?.querySelector('.checkin-mount') as HTMLElement | null) ?? null
        const photoNode = (root?.querySelector('.photo-mount') as HTMLElement | null) ?? null
        setOpenPopup((prev) => (prev && prev.key === key ? { ...prev, checkinNode, photoNode } : prev))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteSig])

  // Live photo updates: refresh pin thumbnails without touching popup content
  // (so an open popup's in-progress caption / strip isn't torn down).
  useEffect(() => {
    for (const [, { marker, spot }] of markers.current) {
      marker.setIcon(makeIcon(spot))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSig])

  // Presence avatars beside spots with fresh open check-ins.
  useEffect(() => {
    const layer = presenceLayer.current
    if (!layer) return
    layer.clearLayers()
    const byKey = spotByKeyRef.current
    for (const [key, arr] of presenceRef.current) {
      const sample = arr[0]
      let coords: [number, number] | null = null
      let spotName = sample.spot_name || 'Spot'
      const spot = byKey.get(key)
      if (spot) {
        coords = [spot.lat, spot.lng]
        spotName = spot.name
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

  // Coordinate-only photos: tiny framed-thumbnail markers with their own popup.
  useEffect(() => {
    const layer = photoLayer.current
    if (!layer) return
    layer.clearLayers()
    for (const p of coordPhotosRef.current) {
      const url = photoUrl(p.storage_path)
      L.marker([p.lat as number, p.lng as number], {
        icon: photoMarkerIcon(url),
        zIndexOffset: 400,
        title: p.caption || `Photo by ${p.name || 'someone'}`,
      })
        .bindPopup(photoMarkerPopupHtml(p, url))
        .addTo(layer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordPhotoSig])

  // "Show on map" from the Pictures tab: fly to the photo's location on mount /
  // whenever a new focus is requested (the `at` nonce forces a re-fly), then
  // clear it so re-entering the Map tab doesn't re-fly to a stale spot.
  useEffect(() => {
    if (!focus || !mapRef.current) return
    mapRef.current.flyTo([focus.lat, focus.lng], 17, { duration: 0.9 })
    onFocusConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.at, focus?.lat, focus?.lng])

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

  const toggle = (c: SpotCategory) => {
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

  // Fly to a squad's current rally point (from the squad legend). No-op when the
  // group is scattered / not checked in anywhere.
  const flyToSquad = (coords: { lat: number; lng: number } | null) => {
    if (coords && mapRef.current) mapRef.current.flyTo([coords.lat, coords.lng], 16, { duration: 0.8 })
  }

  // "Use my location" while placing a spot: prefer the live dot, else a fresh
  // GPS fix. Flies to the point and drops the draft pin there.
  const useMyLocationForSpot = () => {
    const drop = (lat: number, lng: number) => {
      setDraftPoint({ lat, lng })
      mapRef.current?.flyTo([lat, lng], 17, { duration: 0.6 })
    }
    if (live.me) {
      drop(live.me.lat, live.me.lng)
      return
    }
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        drop(p.coords.latitude, p.coords.longitude)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
  }

  // A stable prefill for the form (memoized on the spot being edited so typing
  // isn't reset every render).
  const spotFormInitial = useMemo<SpotFields | null>(
    () =>
      editingSpot
        ? { name: editingSpot.name, category: editingSpot.category, note: editingSpot.notes }
        : null,
    [editingSpot],
  )

  const submitSpot = (fields: SpotFields) => {
    if (editingSpot) {
      spots.editSpot(editingSpot.spotKey, {
        name: fields.name,
        category: fields.category,
        note: fields.note || null,
      })
      closeSpotFlow()
      return
    }
    const point = draftPoint
    if (!point) return
    // Attribute to the shared identity — prompt for a name first if unset.
    spotGate.request(() => {
      const name = (live.name || localStorage.getItem('sdfg.name') || 'Someone').trim() || 'Someone'
      spots
        .addSpot({
          name: fields.name,
          category: fields.category,
          lat: point.lat,
          lng: point.lng,
          note: fields.note || null,
          added_by_name: name,
          added_by_device: live.myId,
        })
        .then(({ data }) => {
          if (data && mapRef.current) mapRef.current.flyTo([point.lat, point.lng], 17, { duration: 0.6 })
        })
      closeSpotFlow()
    })
  }

  const allOn = ALL_CATS.every((c) => active.has(c)) && !topVoted

  return (
    <div className="mapview">
      <div className="mapview-bar">
        <div className="filterscroll">
          <button
            className={`chip chip--all${allOn ? ' chip--on' : ''}`}
            onClick={() => {
              setTopVoted(false)
              setActive(allOn ? new Set() : new Set(ALL_CATS))
            }}
          >
            {allOn ? 'Clear' : 'All'}
          </button>
          {spots.configured && (
            <button
              className={`chip chip--add${addMode ? ' chip--on' : ''}`}
              onClick={() => {
                if (addMode) closeSpotFlow()
                else {
                  setEditingSpot(null)
                  setDraftPoint(null)
                  setAddMode(true)
                }
              }}
              aria-pressed={addMode}
            >
              <span className="chip-plus" aria-hidden>＋</span>
              Add spot
            </button>
          )}
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
          {userSpots.some((s) => s.category === 'poi') && (
            <button
              className={`chip${active.has('poi') && !topVoted ? ' chip--on' : ''}`}
              style={{ ['--chip' as string]: poiColor }}
              onClick={() => toggle('poi')}
              aria-pressed={active.has('poi') && !topVoted}
            >
              <span className="chip-dot" />
              POI
            </button>
          )}
        </div>
      </div>

      <div className="mapview-stage">
        <div ref={mapEl} className="leaflet-stage" role="application" aria-label="Map of San Diego venues and live attendee locations" />
        <SharePanel live={live} onRecenter={flyToMe} />

        {squads.configured && (
          <div className={`squadlegend${legendOpen ? '' : ' squadlegend--collapsed'}`}>
            <button
              className="squadlegend-handle"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
            >
              <span className="squadlegend-ico" aria-hidden>🚩</span>
              <span className="squadlegend-title">Squads</span>
              <span className="squadlegend-count mono">{squads.squads.length}</span>
              <span className="squadlegend-caret" aria-hidden>{legendOpen ? '▾' : '▴'}</span>
            </button>
            {legendOpen && (
              <div className="squadlegend-body">
                {squadLegend.length === 0 ? (
                  <p className="squadlegend-empty">
                    No squads yet. Split the crew into groups for the night — everyone stays on the map.
                  </p>
                ) : (
                  <ul className="squadlegend-list">
                    {squadLegend.map((r) => (
                      <li key={r.squad.id}>
                        <button
                          className="squadlegend-row"
                          onClick={() => flyToSquad(r.coords)}
                          disabled={!r.coords}
                          title={r.coords ? `Fly to ${r.locLabel}` : r.locLabel}
                        >
                          <span className="squadlegend-emoji" aria-hidden>{r.squad.emoji || '📍'}</span>
                          <span className="squadlegend-main">
                            <span className="squadlegend-name">{r.squad.name}</span>
                            <span className={`squadlegend-loc${r.coords ? ' squadlegend-loc--here' : ''}`}>
                              {r.coords ? '📍 ' : ''}
                              {r.locLabel}
                            </span>
                          </span>
                          <span className="squadlegend-avs" aria-hidden>
                            {r.members.slice(0, 3).map((m) => (
                              <span
                                key={m.device_id}
                                className="squadlegend-av"
                                style={{ ['--av' as string]: colorForId(m.device_id) }}
                              >
                                {initials(m.name || '')}
                              </span>
                            ))}
                            {r.members.length > 3 && (
                              <span className="squadlegend-more">+{r.members.length - 3}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="squadlegend-manage" onClick={() => onOpenSquads?.()}>
                  <span className="chip-plus" aria-hidden>＋</span> Create or join
                </button>
              </div>
            )}
          </div>
        )}

        {(addMode || editingSpot) && (
          <AddSpotPanel
            mode={editingSpot ? 'edit' : 'add'}
            initial={spotFormInitial}
            point={draftPoint}
            locating={locating}
            onUseMyLocation={useMyLocationForSpot}
            onSubmit={submitSpot}
            onClose={closeSpotFlow}
          />
        )}

        {/* Prominent "add a photo here" while checked in somewhere. */}
        {photos.configured && myOpen && (
          <div className="map-photo-fab">
            <PhotoUpload
              spotKey={myOpen.spot_key}
              lat={myOpenCoords?.lat ?? null}
              lng={myOpenCoords?.lng ?? null}
              deviceId={live.myId}
              upload={photos.upload}
              requestName={photoGate.request}
              variant="prominent"
              label="Add a photo here"
            />
          </div>
        )}
      </div>

      {openPopup?.checkinNode &&
        createPortal(
          <CheckInButton
            spotKey={openPopup.key}
            spotName={openPopup.spot.name}
            lat={openPopup.spot.lat}
            lng={openPopup.spot.lng}
            deviceId={live.myId}
            myOpen={myOpen}
            squadId={mySquadId}
            checkIn={checkins.checkIn}
            checkOut={checkins.checkOut}
            requestName={checkinGate.request}
          />,
          openPopup.checkinNode,
        )}

      {openPopup?.photoNode &&
        createPortal(
          <SpotPhotos
            spotKey={openPopup.key}
            lat={openPopup.spot.lat}
            lng={openPopup.spot.lng}
            photos={photos.photosFor(openPopup.key)}
            deviceId={live.myId}
            upload={photos.upload}
            requestName={photoGate.request}
          />,
          openPopup.photoNode,
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
      <NamePrompt
        open={photoGate.promptOpen}
        onSave={photoGate.resolve}
        onCancel={photoGate.cancel}
        title="Who’s sharing this photo?"
        lede="Pick your name so the crew knows whose shot this is. Saved on this device only."
        cta="Save & continue"
      />
      <NamePrompt
        open={spotGate.promptOpen}
        onSave={spotGate.resolve}
        onCancel={spotGate.cancel}
        title="Who’s adding this spot?"
        lede="Pick your name so the crew knows who put this on the map. Saved on this device only."
        cta="Save & add spot"
      />
    </div>
  )
}
