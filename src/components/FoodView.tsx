import { useState } from 'react'
import { categoryColor, foodCategories, venueKey, venues, type VenueCategory } from '../data/venues'
import type { LiveState } from '../lib/useLiveLocations'
import { useNameGate, useVoteGate, type VotesApi } from '../lib/useSocial'
import type { Spot } from '../lib/social'
import type { LatLng } from '../lib/points'
import VoteButton from './VoteButton'
import NamePrompt from './NamePrompt'
import AddSpotPanel, { type SpotFields } from './AddSpotPanel'

const FOOD_CATS = foodCategories

// A curated venue or a user-added spot, flattened into one card model.
type FoodItem = {
  key: string
  name: string
  category: VenueCategory
  area?: string
  notes: string
  schedule?: string
  tags?: VenueCategory[]
  userAdded: boolean
  addedBy?: string | null
}

export default function FoodView({
  live,
  votes,
  spots,
  onShowSpot,
}: {
  live: LiveState
  votes: VotesApi
  // Rows are read for the list; addSpot/configured drive the "add a food spot"
  // flow. Typed to just what's used so App can pass the full useSpots() hook.
  spots: {
    spots: Spot[]
    addSpot: (input: {
      name: string
      category?: string | null
      lat: number
      lng: number
      note?: string | null
      added_by_name: string
      added_by_device: string
    }) => Promise<{ data: Spot | null; error: string | null }>
    configured: boolean
  }
  // Fly the map to a spot (by spot_key) with its popup already open.
  onShowSpot: (spotKey: string) => void
}) {
  const [filter, setFilter] = useState<VenueCategory | 'All'>('All')
  const cats = filter === 'All' ? FOOD_CATS : [filter]
  const gate = useVoteGate(votes, live)

  // "Add a food spot" flow: a modal sheet with the location captured from a
  // pasted Google Maps link / coordinates (or "use my location") — no map to
  // tap on this tab. Name-gated on submit like the map's add flow.
  const [adding, setAdding] = useState(false)
  const [point, setPoint] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const spotGate = useNameGate(live)

  const closeAdd = () => {
    setAdding(false)
    setPoint(null)
    setLocating(false)
  }

  const useMyLocation = () => {
    if (live.me) {
      setPoint({ lat: live.me.lat, lng: live.me.lng })
      return
    }
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        setPoint({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => setLocating(false),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
  }

  const submitFoodSpot = (fields: SpotFields) => {
    const pt = point
    if (!pt) return
    // Attribute to the shared identity — prompt for a name first if unset.
    spotGate.request(() => {
      const name = (live.name || localStorage.getItem('sdfg.name') || 'Someone').trim() || 'Someone'
      spots.addSpot({
        name: fields.name,
        category: fields.category,
        lat: pt.lat,
        lng: pt.lng,
        note: fields.note || null,
        added_by_name: name,
        added_by_device: live.myId,
      })
      closeAdd()
    })
  }

  // Curated venues + user-added spots whose category is a food/drink one.
  const venueItems: FoodItem[] = venues.map((v) => ({
    key: venueKey(v),
    name: v.name,
    category: v.category,
    area: v.area,
    notes: v.notes,
    schedule: v.schedule,
    tags: v.tags,
    userAdded: false,
  }))
  const foodCatSet = new Set<string>(FOOD_CATS)
  const userItems: FoodItem[] = spots.spots
    .filter((s) => s.category != null && foodCatSet.has(s.category))
    .map((s) => ({
      key: s.id,
      name: s.name,
      category: s.category as VenueCategory,
      notes: s.note ?? '',
      userAdded: true,
      addedBy: s.added_by_name,
    }))
  const allItems = [...venueItems, ...userItems]

  return (
    <section className="foodview">
      <header className="view-head">
        <p className="section-eyebrow">Where to eat &amp; drink</p>
        <h1 className="view-title">Tacos, taprooms &amp; rooftops.</h1>
        <p className="view-lede">
          Everything the crew scouted for the week, sorted by type. Tap “Show on map” to see it in
          context with everyone’s live location.
        </p>
        {spots.configured && (
          <button className="btn btn--primary btn--sm foodadd-btn" onClick={() => setAdding(true)}>
            <span className="chip-plus" aria-hidden>＋</span> Add a food spot
          </button>
        )}
        <div className="filterscroll filterscroll--flush">
          <button className={`chip${filter === 'All' ? ' chip--on' : ''}`} onClick={() => setFilter('All')}>
            All
          </button>
          {FOOD_CATS.map((c) => (
            <button
              key={c}
              className={`chip${filter === c ? ' chip--on' : ''}`}
              style={{ ['--chip' as string]: categoryColor[c] }}
              onClick={() => setFilter(c)}
            >
              <span className="chip-dot" />
              {c}
            </button>
          ))}
        </div>
      </header>

      {cats.map((cat) => {
        const list = allItems.filter((i) => i.category === cat)
        if (!list.length) return null
        return (
          <div key={cat} className="food-group">
            <div className="food-group-head">
              <span className="food-group-swatch" style={{ background: categoryColor[cat] }} />
              <h2>{cat}</h2>
              <span className="mono food-group-count">{list.length}</span>
            </div>
            <div className="food-grid">
              {list.map((item) => (
                <article
                  key={item.key}
                  className={`foodcard${item.userAdded ? ' foodcard--user' : ''}`}
                  style={{ ['--accent' as string]: categoryColor[item.category] }}
                >
                  <div className="foodcard-top">
                    <h3>{item.name}</h3>
                    {item.userAdded ? (
                      <span className="foodcard-added mono">added by {item.addedBy || 'someone'}</span>
                    ) : (
                      item.area && <span className="foodcard-area mono">{item.area}</span>
                    )}
                  </div>
                  {item.notes && <p className="foodcard-notes">{item.notes}</p>}
                  {item.schedule && <p className="foodcard-sched">📌 {item.schedule}</p>}
                  <div className="foodcard-foot">
                    {votes.configured && (
                      <VoteButton
                        count={votes.countFor(item.key)}
                        active={votes.hasMine(item.key)}
                        onVote={() => gate.request(item.key)}
                      />
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <span className="foodcard-tags">
                        {item.tags.map((t) => (
                          <span key={t} className="tag" style={{ ['--tag' as string]: categoryColor[t] }}>
                            also {t.toLowerCase()}
                          </span>
                        ))}
                      </span>
                    )}
                    <button className="foodcard-map" onClick={() => onShowSpot(item.key)}>
                      Show on map →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      })}

      {adding && (
        <div className="nameprompt-backdrop" onClick={closeAdd}>
          <div className="foodadd-modal" onClick={(e) => e.stopPropagation()}>
            <AddSpotPanel
              mode="add"
              variant="modal"
              heading="Add a food spot"
              initial={null}
              categories={FOOD_CATS}
              allowLink
              point={point}
              locating={locating}
              onUseMyLocation={useMyLocation}
              onSetPoint={setPoint}
              onSubmit={submitFoodSpot}
              onClose={closeAdd}
            />
          </div>
        </div>
      )}

      <NamePrompt open={gate.promptOpen} onSave={gate.resolve} onCancel={gate.cancel} />
      <NamePrompt
        open={spotGate.promptOpen}
        onSave={spotGate.resolve}
        onCancel={spotGate.cancel}
        title="Who’s adding this spot?"
        lede="Pick your name so the crew knows who put this on the map. Saved on this device only."
        cta="Save & add spot"
      />
    </section>
  )
}
