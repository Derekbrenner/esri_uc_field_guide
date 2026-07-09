import { crew } from '../data/attendees'

export default function CrewView() {
  const total = crew.reduce((n, g) => n + g.people.length, 0)

  return (
    <section className="crewview">
      <header className="view-head">
        <p className="section-eyebrow">Who’s in town</p>
        <h1 className="view-title">The crew — {total}+ strong.</h1>
        <p className="view-lede">Arrival and departure dates from the trip doc. “?” means still TBD.</p>
      </header>

      <div className="crew-groups">
        {crew.map((g) => (
          <div key={g.group} className="crew-group">
            <div className="crew-group-head">
              <h2>{g.group}</h2>
              <span className="mono crew-count">{g.people.length}</span>
            </div>
            <ul className="crew-list">
              {g.people.map((p, i) => (
                <li key={p.name + i} className="crew-row">
                  <span className="crew-name">
                    {p.name}
                    {p.note && <span className="crew-tag">{p.note}</span>}
                  </span>
                  <span className="crew-dates mono">
                    <span className="crew-in">{p.arrival ?? '?'}</span>
                    <span className="crew-arrow" aria-hidden>→</span>
                    <span className="crew-out">{p.departure ?? '?'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
