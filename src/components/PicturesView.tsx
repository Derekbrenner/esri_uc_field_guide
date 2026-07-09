import { useEffect, useMemo, useState } from 'react'
import type { Photo } from '../lib/social'
import { photoUrl } from '../lib/social'
import { useNameGate, type usePhotos } from '../lib/useSocial'
import { colorForId, type LiveState } from '../lib/useLiveLocations'
import { venues, type Venue } from '../data/venues'
import PhotoUpload from './PhotoUpload'
import NamePrompt from './NamePrompt'

type PhotosApi = ReturnType<typeof usePhotos>

// Resolve a photo's spot back to a curated venue (via its 'venue:<slug>' key)
// so tiles can name the place and "Show on map" knows where to fly.
function useVenueBySlug() {
  return useMemo(() => {
    const m = new Map<string, Venue>()
    for (const v of venues) m.set(v.slug, v)
    return m
  }, [])
}

function coordsOf(p: Photo, bySlug: Map<string, Venue>): { lat: number; lng: number } | null {
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng }
  if (p.spot_key?.startsWith('venue:')) {
    const v = bySlug.get(p.spot_key.slice('venue:'.length))
    if (v) return { lat: v.lat, lng: v.lng }
  }
  return null
}

function whereLabel(p: Photo, bySlug: Map<string, Venue>): string {
  if (p.spot_key?.startsWith('venue:')) {
    const v = bySlug.get(p.spot_key.slice('venue:'.length))
    if (v) return v.name
  }
  if (p.lat != null && p.lng != null) return 'Around town'
  return 'No location'
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

// Group photos (already newest-first) into day buckets, preserving order.
function groupByDay(photos: Photo[]): { key: string; label: string; items: Photo[] }[] {
  const groups: { key: string; label: string; items: Photo[] }[] = []
  const index = new Map<string, number>()
  for (const p of photos) {
    const d = new Date(p.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let at = index.get(key)
    if (at == null) {
      at = groups.length
      index.set(key, at)
      groups.push({ key, label: dayFmt.format(d), items: [] })
    }
    groups[at].items.push(p)
  }
  return groups
}

export default function PicturesView({
  photos,
  live,
  onShowOnMap,
}: {
  photos: PhotosApi
  live: LiveState
  onShowOnMap: (lat: number, lng: number) => void
}) {
  const bySlug = useVenueBySlug()
  const gate = useNameGate(live)
  const [openId, setOpenId] = useState<string | null>(null)

  const days = useMemo(() => groupByDay(photos.photos), [photos.photos])
  const open = useMemo(
    () => photos.photos.find((p) => p.id === openId) ?? null,
    [photos.photos, openId],
  )

  // Close the lightbox if its photo was deleted (here or on another device).
  useEffect(() => {
    if (openId && !open) setOpenId(null)
  }, [openId, open])

  // Escape closes the lightbox.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openCoords = open ? coordsOf(open, bySlug) : null

  return (
    <section className="picsview">
      <header className="view-head">
        <p className="section-eyebrow">The crew’s camera roll</p>
        <h1 className="view-title">Pictures.</h1>
        <p className="view-lede">
          Every shot the crew drops around town, newest first. Add one from any spot on the map, or
          straight from here — it pins to wherever you’re standing.
        </p>
        <div className="pics-add">
          <PhotoUpload
            spotKey={null}
            deviceId={live.myId}
            upload={photos.upload}
            requestName={gate.request}
            variant="prominent"
            label="Add a photo"
          />
        </div>
      </header>

      <div className="pics-body">
        {photos.photos.length === 0 ? (
          <p className="pics-empty">No photos yet — be the first to drop one.</p>
        ) : (
          days.map((day) => (
            <div key={day.key} className="pics-day">
              <div className="pics-day-head">
                <h2>{day.label}</h2>
                <span className="mono pics-day-count">{day.items.length}</span>
              </div>
              <div className="pics-grid">
                {day.items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pics-tile"
                    onClick={() => setOpenId(p.id)}
                    style={{ ['--who' as string]: colorForId(p.device_id) }}
                  >
                    <img
                      className="pics-tile-img"
                      src={photoUrl(p.storage_path)}
                      alt={p.caption || `Photo by ${p.name || 'someone'}`}
                      loading="lazy"
                    />
                    <span className="pics-tile-meta">
                      <span className="pics-tile-who">
                        <span className="pics-tile-dot" aria-hidden />
                        {p.name || 'Someone'}
                      </span>
                      <span className="pics-tile-sub mono">
                        {timeFmt.format(new Date(p.created_at))} · {whereLabel(p, bySlug)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {open && (
        <div className="lightbox-backdrop" onClick={() => setOpenId(null)}>
          <div
            className="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Photo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setOpenId(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <div className="lightbox-stage">
              <img src={photoUrl(open.storage_path)} alt={open.caption || 'Photo'} />
            </div>
            <div className="lightbox-foot">
              {open.caption && <p className="lightbox-caption">{open.caption}</p>}
              <div className="lightbox-by">
                <span className="lightbox-dot" style={{ background: colorForId(open.device_id) }} />
                <span className="lightbox-name">{open.name || 'Someone'}</span>
                <span className="lightbox-where">· {whereLabel(open, bySlug)}</span>
                <span className="lightbox-when mono">
                  {timeFmt.format(new Date(open.created_at))}
                </span>
              </div>
              <div className="lightbox-actions">
                {openCoords && (
                  <button
                    type="button"
                    className="lightbox-map"
                    onClick={() => {
                      setOpenId(null)
                      onShowOnMap(openCoords.lat, openCoords.lng)
                    }}
                  >
                    Show on map →
                  </button>
                )}
                {open.device_id === live.myId && (
                  <button
                    type="button"
                    className="lightbox-del"
                    onClick={() => {
                      photos.remove({ id: open.id, storage_path: open.storage_path })
                      setOpenId(null)
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <NamePrompt
        open={gate.promptOpen}
        onSave={gate.resolve}
        onCancel={gate.cancel}
        title="Who’s sharing this photo?"
        lede="Pick your name so the crew knows whose shot this is. Saved on this device only."
        cta="Save & continue"
      />
    </section>
  )
}
