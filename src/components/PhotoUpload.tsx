import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraIcon } from './icons'

// ---------------------------------------------------------------------------
// PhotoUpload (Phase 4). A self-contained "add a photo" control used in three
// places: inside a spot's map popup, as a prominent action while checked in,
// and on the Pictures tab (no spot → the shot pins to your current location).
//
// The file is downscaled to ≤1600px as a ~0.85 JPEG *in the browser* (canvas,
// no library) before upload, so we never ship a 12MP phone photo over the wire.
// Identity comes from the shared localStorage name; the name-gate holds the
// post until a name is set, exactly like votes / check-ins.
// ---------------------------------------------------------------------------

const MAX_DIM = 1600
const JPEG_QUALITY = 0.85
const NAME_KEY = 'sdfg.name'

const NAME_NOW = () => (localStorage.getItem(NAME_KEY) || 'Someone').trim() || 'Someone'

// The subset of uploadPhoto's meta this control fills in.
type UploadFn = (
  file: Blob,
  meta: {
    device_id: string
    name: string
    spot_key?: string | null
    lat?: number | null
    lng?: number | null
    caption?: string | null
  },
) => Promise<{ data: unknown; error: string | null }>

type Props = {
  // The spot to attach to. Null → a coordinate-only drop at the user's GPS fix.
  spotKey: string | null
  // Coordinates to stamp on the photo when we have a spot; ignored when spotKey
  // is null (we read live GPS in that case).
  lat?: number | null
  lng?: number | null
  deviceId: string
  upload: UploadFn
  // Name-gate: run the post, prompting for a name first if none is set.
  requestName: (action: () => void) => void
  // Visual treatment: 'inline' inside popups / lists, 'prominent' for the
  // floating "Add a photo here" affordance shown while checked in.
  variant?: 'inline' | 'prominent'
  label?: string
}

// Draw the file onto a canvas at ≤MAX_DIM and re-encode as JPEG. Uses
// createImageBitmap with EXIF orientation baked in where available (so phone
// photos aren't sideways), falling back to an <img> decode.
async function decodeViaImage(
  file: File,
): Promise<{ width: number; height: number; source: CanvasImageSource; cleanup: () => void }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      cleanup: () => URL.revokeObjectURL(url),
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

async function downscale(file: File): Promise<Blob> {
  let width: number
  let height: number
  let source: CanvasImageSource
  let cleanup: () => void

  // Prefer createImageBitmap (fast + bakes EXIF orientation); fall back to an
  // <img> decode if it's unavailable or throws on this browser.
  let decoded: { width: number; height: number; source: CanvasImageSource; cleanup: () => void } | null = null
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      decoded = { width: bmp.width, height: bmp.height, source: bmp, cleanup: () => bmp.close() }
    } catch {
      decoded = null
    }
  }
  if (!decoded) decoded = await decodeViaImage(file)
  ;({ width, height, source, cleanup } = decoded)

  const scale = Math.min(1, MAX_DIM / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    cleanup?.()
    return file
  }
  ctx.drawImage(source, 0, 0, w, h)
  cleanup?.()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  return blob ?? file
}

// Best-effort current position; resolves null if unavailable / denied so a
// spot-less photo still uploads (it just won't have a map location).
function currentCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    )
  })
}

type Phase = 'idle' | 'processing' | 'ready' | 'uploading' | 'done' | 'error'

export default function PhotoUpload({
  spotKey,
  lat,
  lng,
  deviceId,
  upload,
  requestName,
  variant = 'inline',
  label,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const previewRef = useRef<string | null>(null)
  const doneTimer = useRef<number | null>(null)

  // Revoke any object URL we're holding when it changes / on unmount.
  const setPreviewUrl = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setPreview(url)
  }, [])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      if (doneTimer.current) window.clearTimeout(doneTimer.current)
    },
    [],
  )

  const reset = useCallback(() => {
    setPreviewUrl(null)
    blobRef.current = null
    setCaption('')
    setError(null)
    setPhase('idle')
  }, [setPreviewUrl])

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // allow re-picking the same file later
      if (!file) return
      if (!file.type.startsWith('image/')) {
        setError('That doesn’t look like an image.')
        setPhase('error')
        return
      }
      setError(null)
      setPhase('processing')
      try {
        const blob = await downscale(file)
        blobRef.current = blob
        setPreviewUrl(URL.createObjectURL(blob))
        setPhase('ready')
      } catch {
        setError('Couldn’t read that photo — try another.')
        setPhase('error')
      }
    },
    [setPreviewUrl],
  )

  const doUpload = useCallback(async () => {
    const blob = blobRef.current
    if (!blob) return
    setPhase('uploading')
    setError(null)
    let coords: { lat: number; lng: number } | null = null
    if (spotKey) coords = lat != null && lng != null ? { lat, lng } : null
    else coords = await currentCoords()

    const { error: err } = await upload(blob, {
      device_id: deviceId,
      name: NAME_NOW(),
      spot_key: spotKey,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      caption: caption.trim() || null,
    })
    if (err) {
      setError(err)
      setPhase('error')
      return
    }
    setPreviewUrl(null)
    blobRef.current = null
    setCaption('')
    setPhase('done')
    doneTimer.current = window.setTimeout(() => setPhase('idle'), 1800)
  }, [spotKey, lat, lng, deviceId, upload, caption, setPreviewUrl])

  const onPost = () => requestName(() => doUpload())

  const idleLabel = label ?? 'Add a photo'

  // Preview + caption + post — shown once a file is chosen and downscaled.
  if ((phase === 'ready' || phase === 'uploading') && preview) {
    return (
      <div className={`photoup photoup--open photoup--${variant}`}>
        <div className="photoup-preview">
          <img src={preview} alt="Selected photo preview" />
        </div>
        <input
          className="photoup-caption"
          placeholder="Add a caption (optional)"
          value={caption}
          maxLength={140}
          onChange={(e) => setCaption(e.target.value)}
          disabled={phase === 'uploading'}
        />
        <div className="photoup-actions">
          <button
            type="button"
            className="photoup-cancel"
            onClick={reset}
            disabled={phase === 'uploading'}
          >
            Cancel
          </button>
          <button
            type="button"
            className="photoup-post"
            onClick={onPost}
            disabled={phase === 'uploading'}
            aria-busy={phase === 'uploading'}
          >
            {phase === 'uploading' ? 'Posting…' : 'Post photo'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`photoup photoup--${variant}`}>
      <label className={`photoup-btn${phase === 'processing' ? ' photoup-btn--busy' : ''}`}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="photoup-input"
          onChange={onPick}
          disabled={phase === 'processing' || phase === 'uploading'}
        />
        <CameraIcon className="photoup-ico" />
        <span>
          {phase === 'processing'
            ? 'Preparing…'
            : phase === 'done'
              ? 'Posted ✓'
              : idleLabel}
        </span>
      </label>
      {phase === 'error' && error && <p className="photoup-error">{error}</p>}
    </div>
  )
}
