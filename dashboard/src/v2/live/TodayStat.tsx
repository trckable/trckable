// Today's people as the third figure beside the two on Live's card: the count, and how it stands against a usual weekday.
import { weekdayName } from '../../lib/format'
import { todayIn } from '../../lib/dates'
import { copy } from './copy'
import { usualLine } from './liveModel'
import { Tick } from './Tick'
import type { LiveNow } from '../../features/live/api'

interface Props {
  today: LiveNow['today']
  /** The site's time zone: the weekday "usual" is told for. */
  timezone: string
}

export function TodayStat({ today, timezone }: Props) {
  if (!today || today.visitors <= 0) return null
  const line = usualLine(today.visitors, today.before, today.compare)
  return (
    <div className="lside ltoday">
      <span className="ll">{copy.today}</span>
      <b className="lbign"><Tick n={today.visitors} /></b>
      {line?.tone === 'flat' && <span className="mk-ld">{copy.aboutUsual}</span>}
      {line && line.tone !== 'flat' && <span className={`mk-ld ${line.tone}`}>{copy.vsDay(line.tone === 'up', line.pct, weekdayName(todayIn(timezone)))}</span>}
    </div>
  )
}
