// One visit: when, where from, on what, and the timeline of what they did.
import { countryName, flag, fmtDuration } from '../../lib/format'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { copy } from './copy'
import type { VisitStory } from './model'
import { SourceChip, type OnFilter } from './SourceChip'
import { TimelineNode } from './TimelineNode'
import { fmtDayShort, fmtTime, isoOf } from './when'

export function VisitCard({ v, currency, onFilter }: { v: VisitStory; currency: string; onFilter?: OnFilter }) {
  const headId = `jr-${v.key}`
  return (
    <li className={v.live ? 'jr-visit live' : 'jr-visit'} aria-labelledby={headId}>
      <div className="jr-visit-head">
        <h3 id={headId}>
          <span className="jr-visit-no">{copy.visit(v.number)}</span>
          <time className="num" dateTime={isoOf(v.start)}>
            {copy.dayTime(fmtDayShort(v.start), fmtTime(v.start))}
          </time>
        </h3>
        <SourceChip channel={v.channel} referrer={v.referrer} onFilter={onFilter} />
        <span className="jr-visit-meta faint">
          {v.country && (
            <span title={countryName(v.country)}>
              <span aria-hidden="true">{flag(v.country)}</span> {v.country}
            </span>
          )}
          {v.device && (
            <span title={v.device}>
              <DeviceIcon device={v.device} /> {v.device}
            </span>
          )}
          <span className="num">
            {copy.viewsFor(v.pageviews, fmtDuration(v.engagedS))}
          </span>
        </span>
      </div>
      {v.nodes.length === 0 && <p className="faint jr-none">{copy.noPages}</p>}
      <ol className="jr-timeline" aria-label={copy.visitEvents(v.number)}>
        {v.nodes.map((n, i) => (
          <TimelineNode key={n.key} n={n} index={i} first={i === 0} live={v.live} currency={currency} onFilter={onFilter} />
        ))}
      </ol>
    </li>
  )
}
