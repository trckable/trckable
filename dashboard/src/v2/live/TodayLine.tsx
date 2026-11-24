// Today's people told once, under the half hour's figures: how many, and how that stands against a usual weekday.
import { weekdayName } from '../../lib/format'
import { todayIn } from '../../lib/dates'
import { copy } from './copy'
import { usualLine } from './liveModel'
import type { LiveNow } from '../../features/live/api'

interface Props {
  today: LiveNow['today']
  /** The site's time zone: the weekday "usual" is told for. */
  timezone: string
}

export function TodayLine({ today, timezone }: Props) {
  if (!today || today.visitors <= 0) return null
  const line = usualLine(today.visitors, today.before, today.compare)
  return (
    <p className="lusual" data-tone={line?.tone}>
      {copy.today(today.visitors)}
      {line && ' · '}
      {line?.tone === 'flat' && copy.aboutUsual}
      {line && line.tone !== 'flat' && (
        <>
          <b>{`${line.tone === 'up' ? '↑' : '↓'} ${line.pct}%`}</b> {(line.tone === 'up' ? copy.aboveDay : copy.belowDay)(weekdayName(todayIn(timezone)))}
        </>
      )}
    </p>
  )
}
