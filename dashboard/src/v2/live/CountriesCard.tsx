// Live's third card: where the people on the site are from, and phone against computer.
import { fmtPct } from '../../lib/format'
import { copy } from './copy'
import type { listsOf } from './liveModel'

export function CountriesCard({ lists }: { lists: ReturnType<typeof listsOf> }) {
  if (lists.countries.length === 0) return null
  return (
    <section className="mk-card lcard">
      <div className="ph">
        <span className="t">{copy.countries}</span>
      </div>
      <div className="pb">
        {lists.countries.map((c) => (
          <div className="lr" key={c.key}>
            <span>{c.label}</span>
            <b>{c.n}</b>
          </div>
        ))}
        {lists.devices && (
          <>
            <div className="lr">
              <span>{copy.phone}</span>
              <b>{fmtPct(lists.devices.phone)}</b>
            </div>
            <div className="lr">
              <span>{copy.computer}</span>
              <b>{fmtPct(lists.devices.computer)}</b>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
