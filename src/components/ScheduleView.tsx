import { schedule } from '../data/schedule'

const TODAY_ISO = '2026-07-09'

export default function ScheduleView() {
  return (
    <section className="schedview">
      <header className="view-head">
        <p className="section-eyebrow">The week</p>
        <h1 className="view-title">Eight days, plotted.</h1>
        <p className="view-lede">
          Alex’s session picks plus the group plans. <span className="legend-group">Highlighted</span>{' '}
          blocks are group meetups and events.
        </p>
      </header>

      <ol className="days">
        {schedule.map((day) => {
          const isPast = day.iso < TODAY_ISO
          return (
            <li key={day.date} className={`day${isPast ? ' day--past' : ''}`}>
              <div className="day-rail">
                <span className="day-num mono">{day.date}</span>
                <span className="day-weekday">{day.weekday}</span>
              </div>

              <div className="day-body">
                {(day.arriving?.length || day.leaving?.length) && (
                  <div className="day-flights">
                    {day.arriving?.length ? (
                      <span className="flight flight--in">
                        <span className="flight-ico" aria-hidden>↓</span> Arriving:{' '}
                        {day.arriving.join(', ')}
                      </span>
                    ) : null}
                    {day.leaving?.length ? (
                      <span className="flight flight--out">
                        <span className="flight-ico" aria-hidden>↑</span> Leaving: {day.leaving.join(', ')}
                      </span>
                    ) : null}
                  </div>
                )}

                <div className="blocks">
                  {day.blocks.map((b, i) => (
                    <div key={i} className={`block${b.group ? ' block--group' : ''}`}>
                      <h3 className="block-title">
                        {b.group && <span className="block-star" aria-hidden>★</span>}
                        {b.title}
                      </h3>
                      <ul className="block-items">
                        {b.items.map((it, j) => (
                          <li key={j} className="block-item">
                            {it.time && <span className="block-time mono">{it.time}</span>}
                            <span className="block-text">
                              {it.text}
                              {it.detail && <span className="block-detail"> — {it.detail}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
