import type { Mention } from './api'
import { page } from './pageCopy'
import { copy } from './copy'
import { FILTERS, filterOf, type Filter } from './pageModel'
import { FeedRow } from './FeedRow'
import type { Period } from './api'

const PERIODS: Period[] = ['7d', '30d', '90d', '1y']

function Choice<T extends string>({ label, value, options, name, onPick }: { label: string; value: T; options: T[]; name: (o: T) => string; onPick: (o: T) => void }) {
  return (
    <div className="mp-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onPick(o)}>
          {name(o)}
        </button>
      ))}
    </div>
  )
}

/** The newest-first list with its source and period filters. */
export function Feed({ list, curves, filter, period, onFilter, onPeriod, onOpen }: { list: Mention[]; curves: Record<string, number[]>; filter: Filter; period: Period; onFilter: (f: Filter) => void; onPeriod: (p: Period) => void; onOpen: (m: Mention) => void }) {
  const shown = filterOf(list, filter)
  return (
    <section className="mp-feed" aria-labelledby="mp-feed-h">
      <div className="mp-feed-head">
        <h2 id="mp-feed-h">{page.feedTitle}</h2>
        <Choice label={page.filters} value={filter} options={FILTERS} name={(f) => (f === 'all' ? page.all : copy.name[f])} onPick={onFilter} />
        <Choice label={page.period} value={period} options={PERIODS} name={(p) => page.periods[p]} onPick={onPeriod} />
      </div>
      {shown.length > 0 ? (
        <ul className="mp-list">
          {shown.map((m) => (
            <FeedRow key={m.id} m={m} curve={curves[m.id]} onOpen={() => onOpen(m)} />
          ))}
        </ul>
      ) : (
        <p className="muted">{page.noMatch}</p>
      )}
    </section>
  )
}
