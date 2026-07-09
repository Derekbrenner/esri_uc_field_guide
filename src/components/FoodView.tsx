import { useState } from 'react'
import type { Tab } from '../App'
import { categoryColor, categoryOrder, venues, type VenueCategory } from '../data/venues'

const FOOD_CATS = categoryOrder.filter((c) => c !== 'Landmark')

export default function FoodView({ onNav }: { onNav: (t: Tab) => void }) {
  const [filter, setFilter] = useState<VenueCategory | 'All'>('All')
  const cats = filter === 'All' ? FOOD_CATS : [filter]

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
        const list = venues.filter((v) => v.category === cat)
        if (!list.length) return null
        return (
          <div key={cat} className="food-group">
            <div className="food-group-head">
              <span className="food-group-swatch" style={{ background: categoryColor[cat] }} />
              <h2>{cat}</h2>
              <span className="mono food-group-count">{list.length}</span>
            </div>
            <div className="food-grid">
              {list.map((v) => (
                <article key={v.name} className="foodcard" style={{ ['--accent' as string]: categoryColor[v.category] }}>
                  <div className="foodcard-top">
                    <h3>{v.name}</h3>
                    {v.area && <span className="foodcard-area mono">{v.area}</span>}
                  </div>
                  <p className="foodcard-notes">{v.notes}</p>
                  {v.schedule && <p className="foodcard-sched">📌 {v.schedule}</p>}
                  <div className="foodcard-foot">
                    {v.tags && v.tags.length > 0 && (
                      <span className="foodcard-tags">
                        {v.tags.map((t) => (
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
    </section>
  )
}
