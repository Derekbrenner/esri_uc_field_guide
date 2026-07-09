import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { categoryColor, categoryOrder, venueKey, venues, type Venue, type VenueCategory } from '../data/venues'
import type { LiveState } from '../lib/useLiveLocations'
import { useVoteGate, type VotesApi } from '../lib/useSocial'
import SharePanel from './SharePanel'
import NamePrompt from './NamePrompt'

const CENTER: [number, number] = [32.7108, -117.1605]

// Marker grows + glows with vote count; the visual is capped at 8 votes so a
// runaway favorite doesn't swallow the map.
const VOTE_CAP = 8

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

// The vote control rendered inside a popup — an HTML twin of <VoteButton>.
// Interactivity is handled by one delegated click listener on the map (below).
function voteHtml(spotKey: string, count: number, mine: boolean): string {
  return `<button type="button" class="votebtn votebtn--pop${mine ? ' votebtn--on' : ''}" data-votekey="${escapeHtml(spotKey)}" aria-pressed="${mine}" aria-label="${mine ? 'Remove your vote' : 'Upvote this spot'}">
      <span class="votebtn-heart" aria-hidden>${mine ? '♥' : '♡'}</span>
      <span class="votebtn-count mono">${count}</span>
    </button>`
}

function popupHtml(v: Venue, spotKey: string, count: number, mine: boolean, voteConfigured: boolean): string {
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
  </div>`
}

export default function MapView({ live, votes }: { live: LiveState; votes: VotesApi }) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const venueLayer = useRef<L.LayerGroup | null>(null)
  const liveLayer = useRef<L.LayerGroup | null>(null)
  const markers = useRef<Map<string, { marker: L.Marker; venue: Venue }>>(new Map())

  const [active, setActive] = useState<Set<VenueCategory>>(() => new Set(categoryOrder))
  const [topVoted, setTopVoted] = useState(false)

  const gate = useVoteGate(votes, live)
  const { countFor, hasMine, configured: voteConfigured } = votes

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
  const requestVoteRef = useRef(gate.request)
  requestVoteRef.current = gate.request

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

    return () => {
      el.removeEventListener('click', onClick)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Rebuild pins only when the visible SET changes (filter / lens change).
  useEffect(() => {
    const layer = venueLayer.current
    if (!layer) return
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
        .bindPopup(popupHtml(v, key, count, mine, voteConfiguredRef.current))
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
        marker.setPopupContent(popupHtml(venue, key, count, mine, voteConfiguredRef.current))
      }
    }
  }, [voteSig])

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

      <NamePrompt open={gate.promptOpen} onSave={gate.resolve} onCancel={gate.cancel} />
    </div>
  )
}
