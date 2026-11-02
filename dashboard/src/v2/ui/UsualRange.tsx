// The usual range being built, as one small pill over the chart: a ring that fills with the days there are (of the days
// the comparison needs), or, for a chart by the hour, when it will be ready. The comparison's own words are its tooltip.
import { copy } from '../briefing/copy'
import type { ChartIn } from './DayChart'

export function UsualRange({ c }: { c: Pick<ChartIn, 'startsOn' | 'learn' | 'noCompare'> }) {
  if (!c.startsOn) return null
  // All the days there and still no comparison: the count would say nothing, so it says when.
  const learn = c.learn && c.learn.have < c.learn.need ? c.learn : null
  const text = learn ? copy.rangeBuilding(learn.have, learn.need) : copy.rangeSoon(c.startsOn)
  const share = learn ? Math.round((100 * learn.have) / Math.max(1, learn.need)) : 0
  return (
    <span className="cc-learn" title={c.noCompare ?? undefined} role="status">
      <i className="cc-ring" style={{ ['--share' as string]: `${share}%` }} aria-hidden="true" />
      <span className={learn ? 'cc-full' : undefined}>{text}</span>
      {learn && <span className="cc-short" aria-hidden="true">{`${learn.have}/${learn.need}`}</span>}
    </span>
  )
}
