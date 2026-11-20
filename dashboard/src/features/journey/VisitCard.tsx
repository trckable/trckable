// One visit: when, where from, on what, and the timeline of what they did. A long visit folds its middle pages into
// one row that opens in place.
import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { countryName, fmtDuration } from '../../lib/format'
import { Flag } from '../../v2/ui/Flag'
import { copy } from './copy'
import { HowMark, howOf, OsMark } from './Marks'
import { foldNodes, type Identity, type VisitStory } from './model'
import { SourceChip, type OnFilter } from './SourceChip'
import { TimelineNode } from './TimelineNode'
import { fmtDayShort, fmtTime, isoOf } from './when'

/** A visit names its place and how it came only when that differs from the header above. */
function Differs({ v, who }: { v: VisitStory; who?: Identity }) {
  const how = howOf(v)
  const same = !who || (how.text === howOf(who).text && v.os === who.os && v.device === who.device)
  return (
    <>
      {v.country && v.country !== who?.country && (
        <span title={countryName(v.country)}>
          <Flag code={v.country} /> {v.country}
        </span>
      )}
      {!same && (
        <span title={how.text}>
          <OsMark os={v.os} />
          <HowMark x={v} />
          {how.text}
        </span>
      )}
    </>
  )
}

export function VisitCard({ v, who, currency, zone, onFilter }: { v: VisitStory; who?: Identity; currency: string; zone?: string; onFilter?: OnFilter }) {
  const headId = `jr-${v.key}`
  const [open, setOpen] = useState(false)
  const rows = open ? v.nodes : foldNodes(v.nodes)
  return (
    <li className={v.live ? 'jr-visit live' : 'jr-visit'} aria-labelledby={headId}>
      <div className="jr-visit-head">
        <h3 id={headId}>
          <span className="jr-visit-no">{copy.visit(v.number)}</span>
          <time className="num" dateTime={isoOf(v.start)}>
            {copy.dayTime(fmtDayShort(v.start, zone), fmtTime(v.start, zone))}
          </time>
        </h3>
        <SourceChip channel={v.channel} referrer={v.referrer} at={v.start} onFilter={onFilter} />
        <span className="jr-visit-meta faint">
          <Differs v={v} who={who} />
          <span className="num">{copy.viewsFor(v.pageviews, fmtDuration(v.engagedS))}</span>
        </span>
      </div>
      {v.nodes.length === 0 && <p className="faint jr-none">{copy.noPages}</p>}
      <ol className="jr-timeline" aria-label={copy.visitEvents(v.number)}>
        {rows.map((n, i) =>
          n.kind === 'fold' ? (
            <li key={n.key} className="jr-node fold">
              <span className="jr-dot" aria-hidden="true" />
              <button type="button" className="jr-fold" aria-expanded="false" onClick={() => setOpen(true)}>
                <ChevronsUpDown size={13} strokeWidth={2} aria-hidden="true" />
                {copy.morePages(n.hidden)}
              </button>
            </li>
          ) : (
            <TimelineNode key={n.key} n={n} index={i} first={n.key === v.nodes[0]?.key} live={v.live} currency={currency} zone={zone} onFilter={onFilter} />
          ),
        )}
      </ol>
      {v.more > 0 && <p className="faint jr-none">{copy.moreEvents(v.more)}</p>}
    </li>
  )
}
