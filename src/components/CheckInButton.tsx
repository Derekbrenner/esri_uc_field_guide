import { useCallback, useState } from 'react'
import { haversineMeters } from '../lib/points'
import type { Checkin } from '../lib/social'

// Within this radius of a spot a check-in counts as "verified"; beyond it the
// user can still check in, but the record is flagged unverified (remote).
const VERIFY_RADIUS_M = 150
const NAME_KEY = 'sdfg.name'

// The subset of insertCheckin's input this control produces. Mirrors the shape
// accepted by useCheckins().checkIn so it can be passed straight through.
export type CheckInInput = {
  spot_key: string
  spot_name: string
  device_id: string
  name: string
  squad_id?: string | null
  verified: boolean
  lat?: number | null
  lng?: number | null
}

type Props = {
  spotKey: string
  spotName: string
  lat: number
  lng: number
  deviceId: string
  // The user's current open check-in (any spot), or null. Drives the "you're
  // here / check out" affordance and the "move you from X" hint.
  myOpen: Checkin | null
  squadId: string | null
  checkIn: (input: CheckInInput) => Promise<{ data: Checkin | null; error: string | null }>
  checkOut: (deviceId: string) => Promise<{ error: string | null }>
  // Name-gate: run the action, prompting for a name first if none is set yet.
  requestName: (action: () => void) => void
}

// Human distance label. Feet under a tenth of a mile, miles otherwise.
function distanceLabel(m: number): string {
  const mi = m / 1609.34
  if (mi < 0.1) return `${Math.round(m / 0.3048 / 10) * 10} ft`
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
}

// The check-in control rendered inside every spot popup (via a React portal, so
// it stays in the app's React tree with live check-in state). On tap it reads
// GPS, measures distance to the spot, and either records a verified check-in
// (≤150 m) or offers a "check in anyway" fallback.
export default function CheckInButton({
  spotKey,
  spotName,
  lat,
  lng,
  deviceId,
  myOpen,
  squadId,
  checkIn,
  checkOut,
  requestName,
}: Props) {
  const hereOpen = myOpen != null && myOpen.spot_key === spotKey
  const elsewhereOpen = myOpen != null && myOpen.spot_key !== spotKey

  const [phase, setPhase] = useState<'idle' | 'locating' | 'far' | 'saving'>('idle')
  const [distanceM, setDistanceM] = useState<number | null>(null)
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nameNow = () => (localStorage.getItem(NAME_KEY) || 'Someone').trim() || 'Someone'

  const doInsert = useCallback(
    async (verified: boolean, p: { lat: number; lng: number } | null) => {
      setPhase('saving')
      await checkIn({
        spot_key: spotKey,
        spot_name: spotName,
        device_id: deviceId,
        name: nameNow(),
        squad_id: squadId ?? null,
        verified,
        lat: p?.lat ?? null,
        lng: p?.lng ?? null,
      })
      // useCheckins updates myOpen → this re-renders into the "checked in" state.
      setPhase('idle')
      setDistanceM(null)
      setPos(null)
      setError(null)
    },
    [checkIn, spotKey, spotName, deviceId, squadId],
  )

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Can’t read your location on this device.')
      setPos(null)
      setDistanceM(null)
      setPhase('far')
      return
    }
    setPhase('locating')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (gp) => {
        const p = { lat: gp.coords.latitude, lng: gp.coords.longitude }
        const d = haversineMeters(p, { lat, lng })
        setPos(p)
        setDistanceM(d)
        if (d <= VERIFY_RADIUS_M) doInsert(true, p)
        else setPhase('far')
      },
      (geoErr) => {
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? 'Location permission denied.'
            : 'Couldn’t get your location.',
        )
        setPos(null)
        setDistanceM(null)
        setPhase('far')
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
  }, [lat, lng, doInsert])

  const onCheckIn = () => requestName(() => locate())
  const onCheckInAnyway = () => doInsert(false, pos)
  const onCheckOut = () => checkOut(deviceId)

  if (hereOpen) {
    return (
      <div className="checkin checkin--here">
        <span className="checkin-status">
          <span className="checkin-tick" aria-hidden>✓</span>
          {myOpen!.verified ? 'You’re checked in here' : 'Checked in (nearby)'}
        </span>
        <button type="button" className="checkin-out" onClick={onCheckOut}>
          Check out
        </button>
      </div>
    )
  }

  if (phase === 'far') {
    return (
      <div className="checkin checkin--far">
        <span className="checkin-far-msg">
          {distanceM != null
            ? `You’re ${distanceLabel(distanceM)} away`
            : error || 'Couldn’t confirm you’re here'}
        </span>
        <div className="checkin-far-actions">
          <button type="button" className="checkin-retry" onClick={onCheckIn}>
            Try again
          </button>
          <button type="button" className="checkin-anyway" onClick={onCheckInAnyway}>
            Check in anyway →
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="checkin-btn"
      onClick={onCheckIn}
      disabled={phase !== 'idle'}
      aria-busy={phase !== 'idle'}
    >
      <span className="checkin-ico" aria-hidden>◎</span>
      {phase === 'locating'
        ? 'Locating…'
        : phase === 'saving'
          ? 'Checking in…'
          : elsewhereOpen
            ? 'Check in here'
            : 'Check in'}
    </button>
  )
}
