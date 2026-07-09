import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { categoryColor, categoryOrder, venues, type VenueCategory } from '../data/venues'
import type { LiveState } from '../lib/useLiveLocations'
import SharePanel from './SharePanel'

const CENTER: [number, number] = [32.7108, -117.1605]

function venueIcon(category: VenueCategory, landmark: boolean): L.DivIcon {
  const color = categoryColor[category]
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin${landmark ? ' pin--landmark' : ''}" style="--pin:${color}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
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

function popupHtml(name: string, category: string, notes: string, schedule: string | undefined, lat: number, lng: number): string {
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  return `<div class="pop">
    <div class="pop-cat mono">${escapeHtml(category)}</div>
    <div class="pop-name">${escapeHtml(name)}</div>
    <div class="pop-notes">${escapeHtml(notes)}</div>
    ${schedule ? `<div class="pop-sched">📌 ${escapeHtml(schedule)}</div>` : ''}
    <a class="pop-dir" href="${dir}" target="_blank" rel="noopener">Directions ↗</a>
  </div>`
}

export default function MapView({ live }: { live: LiveState }) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const venueLayer = useRef<L.LayerGroup | null>(null)
  const liveLayer = useRef<L.LayerGroup | null>(null)

  const [active, setActive] = useState<Set<VenueCategory>>(() => new Set(categoryOrder))

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
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // render venues when filter changes
  useEffect(() => {
    const layer = venueLayer.current
    if (!layer) return
    layer.clearLayers()
    venues
      .filter((v) => active.has(v.category))
      .forEach((v) => {
        L.marker([v.lat, v.lng], { icon: venueIcon(v.category, !!v.landmark), title: v.name })
          .bindPopup(popupHtml(v.name, v.category, v.notes, v.schedule, v.lat, v.lng))
          .addTo(layer)
      })
  }, [active])

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

  const toggle = (c: VenueCategory) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  const flyToMe = () => {
    if (live.me && mapRef.current) mapRef.current.flyTo([live.me.lat, live.me.lng], 16, { duration: 0.8 })
    else if (mapRef.current) mapRef.current.flyTo(CENTER, 15)
  }

  const allOn = active.size === categoryOrder.length

  return (
    <div className="mapview">
      <div className="mapview-bar">
        <div className="filterscroll">
          <button
            className={`chip chip--all${allOn ? ' chip--on' : ''}`}
            onClick={() => setActive(allOn ? new Set() : new Set(categoryOrder))}
          >
            {allOn ? 'Clear' : 'All'}
          </button>
          {categoryOrder.map((c) => (
            <button
              key={c}
              className={`chip${active.has(c) ? ' chip--on' : ''}`}
              style={{ ['--chip' as string]: categoryColor[c] }}
              onClick={() => toggle(c)}
              aria-pressed={active.has(c)}
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
    </div>
  )
}
