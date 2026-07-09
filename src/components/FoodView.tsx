import { useState } from 'react'
import type { Tab } from '../App'
import { categoryColor, categoryOrder, venueKey, venues, type VenueCategory } from '../data/venues'
import type { LiveState } from '../lib/useLiveLocations'
import { useVoteGate, type VotesApi } from '../lib/useSocial'
import type { Spot } from '../lib/social'
import VoteButton from './VoteButton'
import NamePrompt from './NamePrompt'

const FOOD_CATS = categoryOrder.filter((c) => c !== 'Landmark')

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
  onNav,
  live,
  votes,
  spots,
}: {
  onNav: (t: Tab) => void
  live: LiveState
  votes: VotesApi
  // Only the rows are read here; typed loosely so App can pass the full hook.
  spots: { spots: Spot[] }
}) {
  const [filter, setFilter] = useState<VenueCategory | 'All'>('All')
  const cats = filter === 'All' ? FOOD_CATS : [filter]
  const gate = useVoteGate(votes, live)

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
                    <button className="foodcard-map" onClick={() => onNav('Map')}>
                      Show on map →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      })}

      <NamePrompt open={gate.promptOpen} onSave={gate.resolve} onCancel={gate.cancel} />
    </section>
  )
}
