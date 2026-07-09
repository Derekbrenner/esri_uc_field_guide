import { useMemo, useState } from 'react'
import type { LiveState } from '../lib/useLiveLocations'
import { colorForId } from '../lib/useLiveLocations'
import { useNameGate, useSquads } from '../lib/useSocial'
import NamePrompt from './NamePrompt'

// ---------------------------------------------------------------------------
// SquadPanel (Phase 6). A centered dialog / bottom sheet for forming and
// joining squads — the crew splits into groups for the night but stays visible
// to each other. Reachable from the Map tab (squad legend) and the Scores tab.
// Create a squad (name + emoji), or join one from the list; one squad per
// person at a time, so joining another leaves the first. Attribution reuses the
// shared identity (deviceId + name); the name-gate prompts for a name if unset.
// ---------------------------------------------------------------------------

type SquadsApi = ReturnType<typeof useSquads>

// A small themed palette so squads get a recognizable emoji without a picker.
const EMOJI_CHOICES = ['🗺️', '🧭', '⚓', '🌊', '🍺', '🌮', '🔭', '🦅', '🌅', '🏴‍☠️', '🐙', '☕']

function initials(name: string | null | undefined): string {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

export default function SquadPanel({
  open,
  onClose,
  squads,
  live,
}: {
  open: boolean
  onClose: () => void
  squads: SquadsApi
  live: LiveState
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0])
  const [busy, setBusy] = useState(false)
  const gate = useNameGate(live)

  const mySquadId = squads.squadOf(live.myId)
  const mySquad = useMemo(
    () => squads.squads.find((s) => s.id === mySquadId) ?? null,
    [squads.squads, mySquadId],
  )

  // Resolve identity at action time, mirroring MapView: live.name may lag a
  // just-saved name by a render, so fall back to the freshly written localStorage.
  const identityNow = () => ({
    deviceId: live.myId,
    name: (live.name || localStorage.getItem('sdfg.name') || 'Someone').trim() || 'Someone',
  })

  const create = () => {
    const nm = name.trim()
    if (!nm || busy) return
    gate.request(async () => {
      setBusy(true)
      const { data } = await squads.createSquad({
        name: nm,
        emoji,
        created_by_device: live.myId,
      })
      // Creator joins their own squad so they show up in the roster + legend.
      if (data) await squads.joinSquad(data.id, identityNow())
      setName('')
      setEmoji(EMOJI_CHOICES[0])
      setBusy(false)
    })
  }

  const join = (squadId: string) => {
    if (busy) return
    gate.request(() => {
      squads.joinSquad(squadId, identityNow())
    })
  }

  const leave = () => {
    squads.leaveSquad(live.myId)
  }

  if (!open) return null

  return (
    <>
      <div className="squadpanel-backdrop" onClick={onClose}>
      <div
        className="squadpanel"
        role="dialog"
        aria-modal="true"
        aria-label="Squads"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="squadpanel-head">
          <div>
            <p className="section-eyebrow">Split up, stay found</p>
            <h2 className="squadpanel-title">Squads.</h2>
          </div>
          <button className="squadpanel-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {mySquad && (
          <div className="squadpanel-mine">
            <span className="squadpanel-mine-emoji" aria-hidden>{mySquad.emoji || '📍'}</span>
            <span className="squadpanel-mine-name">
              You’re in <strong>{mySquad.name}</strong>
            </span>
            <button className="squadpanel-leave" onClick={leave}>Leave</button>
          </div>
        )}

        {/* Create a new squad */}
        <div className="squadpanel-create">
          <label className="share-label" htmlFor="squad-name">
            {mySquad ? 'Start a different squad' : 'Start a squad'}
          </label>
          <div className="squadpanel-createrow">
            <span className="squadpanel-emoji-current" aria-hidden>{emoji}</span>
            <input
              id="squad-name"
              className="share-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team Basemap"
              maxLength={40}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
              }}
            />
          </div>
          <div className="squadpanel-emojis" role="group" aria-label="Squad emoji">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                className={`squadpanel-emoji${e === emoji ? ' squadpanel-emoji--on' : ''}`}
                onClick={() => setEmoji(e)}
                aria-pressed={e === emoji}
              >
                {e}
              </button>
            ))}
          </div>
          <button
            className="btn btn--primary squadpanel-createbtn"
            onClick={create}
            disabled={!name.trim() || busy}
          >
            {busy ? 'Creating…' : 'Create & join'}
          </button>
        </div>

        {/* Join an existing squad */}
        <div className="squadpanel-list">
          <p className="squadpanel-list-head">
            {squads.squads.length > 0 ? 'Or join the crew' : 'No squads yet — be the first.'}
          </p>
          {squads.squads.length > 0 && (
            <ul className="squadpanel-squads">
              {squads.squads.map((s) => {
                const mem = squads.membersOf(s.id)
                const isMine = s.id === mySquadId
                return (
                  <li key={s.id} className={`squadpanel-squad${isMine ? ' squadpanel-squad--mine' : ''}`}>
                    <span className="squadpanel-squad-emoji" aria-hidden>{s.emoji || '📍'}</span>
                    <span className="squadpanel-squad-main">
                      <span className="squadpanel-squad-name">{s.name}</span>
                      <span className="squadpanel-squad-meta">
                        {mem.length === 0
                          ? 'no members yet'
                          : `${mem.length} ${mem.length === 1 ? 'member' : 'members'}`}
                      </span>
                    </span>
                    <span className="squadpanel-avatars" aria-hidden>
                      {mem.slice(0, 4).map((m) => (
                        <span
                          key={m.device_id}
                          className="squadpanel-av"
                          style={{ ['--av' as string]: colorForId(m.device_id) }}
                          title={m.name || 'Someone'}
                        >
                          {initials(m.name)}
                        </span>
                      ))}
                    </span>
                    {isMine ? (
                      <span className="squadpanel-in mono">in</span>
                    ) : (
                      <button className="squadpanel-join" onClick={() => join(s.id)}>
                        Join
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      </div>

      <NamePrompt
        open={gate.promptOpen}
        onSave={gate.resolve}
        onCancel={gate.cancel}
        title="Who’s joining?"
        lede="Pick your name so your squad knows who’s in. Saved on this device only."
        cta="Save & continue"
      />
    </>
  )
}
