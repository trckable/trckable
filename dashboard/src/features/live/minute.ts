// Where a minute on Live's line opens in Data.
import { todayIn } from '../../lib/dates'
import type { ViewState } from '../../lib/url'

/** A minute on Live's line, opened in Data: the finest range Data draws is a
 *  day by the hour, so it is that minute's day (Now when that is today). */
export function minuteView(ago: number, tz: string, now = new Date()): Partial<ViewState> {
  const day = todayIn(tz, new Date(now.getTime() - ago * 60_000))
  const base = { live: undefined, day: undefined, bucket: 'hour' as const }
  if (day === todayIn(tz, now)) return { ...base, period: 'now', from: undefined, to: undefined }
  return { ...base, period: 'custom', from: day, to: day }
}
