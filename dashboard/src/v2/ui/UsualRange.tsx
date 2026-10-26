// The usual range being built, as one small pill on the period row: a ring that fills with the days there are (of the days
// the comparison needs), or, for a chart by the hour, when it will be ready. The comparison's own words are its tooltip.
import { copy } from '../briefing/copy'
import type { ChartIn } from './DayChart'

export function UsualRange({ c }: { c: Pick<ChartIn, 'startsOn' | 'learn' | 'noCompare'> }) {
  if (!c.startsOn) return null
  const text = c.learn ? copy.rangeBuilding(c.learn.have, c.learn.need) : copy.rangeSoon(c.startsOn)
  const share = c.learn ? Math.round((100 * c.learn.have) / Math.max(1, c.learn.need)) : 0
  return (
    <span className="cc-learn" title={c.noCompare ?? undefined} role="status">
      <i className="cc-ring" style={{ ['--share' as string]: `${share}%` }} aria-hidden="true" />
      <span className={c.learn ? 'cc-full' : undefined}>{text}</span>
      {c.learn && <span className="cc-short" aria-hidden="true">{`${c.learn.have}/${c.learn.need}`}</span>}
    </span>
  )
}
