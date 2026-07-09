import { colorForId } from '../lib/useLiveLocations'
import { formatMeetupWhen } from '../lib/points'
import type { Meetup, MeetupRsvp, Squad } from '../lib/social'

// ---------------------------------------------------------------------------
// MeetupBanner (Phase 7). The upcoming-meetup strip pinned to the top of the Map
// tab — soonest first, horizontally scrollable when there are several. Tapping a
// card flies the map to its pulsing pin; RSVP + cancel live on the card too, so
// you can plan without opening a popup. Squad-targeted meetups are labelled but
// visible to everyone. Rendered only when Supabase is configured and at least
// one meetup is upcoming (MapView gates it).
// ---------------------------------------------------------------------------

function initials(name: string | null | undefined): string {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

export default function MeetupBanner({
  meetups,
  rsvpsFor,
  squads,
  myId,
  onFly,
  onRsvp,
  onCancel,
}: {
  meetups: Meetup[]
  rsvpsFor: (meetupId: string) => MeetupRsvp[]
  squads: Squad[]
  myId: string
  onFly: (meetupId: string) => void
  onRsvp: (meetupId: string, going: boolean) => void
  onCancel: (meetupId: string) => void
}) {
  return (
    <div className="meetupbanner" aria-label="Upcoming meetups">
      <div className="meetupbanner-scroll">
        {meetups.map((m) => {
          const rsvps = rsvpsFor(m.id)
          const going = rsvps.filter((r) => r.going)
          const mine = rsvps.find((r) => r.device_id === myId)
          const squad = m.squad_id ? squads.find((s) => s.id === m.squad_id) : null
          const isCreator = m.created_by_device === myId
          return (
            <div
              key={m.id}
              className="meetupcard"
              role="button"
              tabIndex={0}
              onClick={() => onFly(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onFly(m.id)
                }
              }}
            >
              <div className="meetupcard-top">
                <span className="meetupcard-time mono">🕐 {formatMeetupWhen(m.meet_at)}</span>
                {squad && (
                  <span className="meetupcard-squad">
                    {squad.emoji || '📍'} {squad.name}
                  </span>
                )}
              </div>
              <div className="meetupcard-name">{m.spot_name || 'Meetup'}</div>
              {m.note && <div className="meetupcard-note">{m.note}</div>}
              <div className="meetupcard-by mono">by {m.created_by_name || 'Someone'}</div>

              <div className="meetupcard-foot" onClick={(e) => e.stopPropagation()}>
                <span className="meetupcard-avs" aria-hidden>
                  {going.length === 0 ? (
                    <span className="meetupcard-nogo mono">No RSVPs yet</span>
                  ) : (
                    <>
                      {going.slice(0, 4).map((r) => (
                        <span
                          key={r.device_id}
                          className="meetup-av"
                          style={{ ['--av' as string]: colorForId(r.device_id) }}
                          title={r.name || 'Someone'}
                        >
                          {initials(r.name)}
                        </span>
                      ))}
                      {going.length > 4 && <span className="meetup-avmore">+{going.length - 4}</span>}
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
                  className="meetupcard-cancel"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCancel(m.id)
                  }}
                >
                  Cancel meetup
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
