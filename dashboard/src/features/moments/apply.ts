// What a click on a pin does to the address: its filter (a source, a page, a
// referrer) and, for the moments of a day, that day, the way a note's does
// (features/notes/jump). Every view reads the address, so the tiles, the
// lists and the chart all say the same thing afterwards. Pure: apply.test.ts.
import type { Bucket, Filter } from '../../lib/api'
import { diffDays, type ISODate, type Range } from '../../lib/dates'
import { jumpPatch } from '../notes/jump'
import type { ViewState } from '../../lib/url'
import { hourlySpan } from '../overview/firstVisit'
import type { Pin } from './pins'

export interface Where {
  filters: Filter[]
  range: Range
  today: ISODate
  /** The bucket the chart is drawn in. */
  bucket: Bucket
}

export function patchFor(pin: Pin, at: Where): Partial<ViewState> {
  const mine = pin.filters
  const filters = [...at.filters.filter((f) => !mine.some((m) => m.dim === f.dim)), ...mine]
  // A day the period does not reach is never left off screen: a month around it opens, as it does for a note.
  const outside = !!pin.day && (pin.day < at.range.from || pin.day > at.range.to)
  // By the hour a day inside the period is already on the chart, and picking it would redraw the chart by day.
  if (pin.showDay && pin.day && (at.bucket !== 'hour' || outside)) return { ...jumpPatch(pin.day, at.range, at.bucket === 'day', at.today), filters }
  // A finding with a day (a new referrer's first visit) is on the chart too, but only the filter is applied: no day is picked.
  if (outside && pin.day) return { ...jumpPatch(pin.day, at.range, false, at.today), filters, day: undefined }
  return { filters, day: undefined }
}

/** The bucket the chart is drawn in for a period: the one picked, else by the hour for a short span, then the server's own steps. */
export function chartBucket(view: Pick<ViewState, 'bucket'>, range: Range): Bucket {
  if (view.bucket) return view.bucket
  const days = diffDays(range.from, range.to)
  if (hourlySpan(range.from, range.to)) return 'hour'
  if (days <= 120) return 'day'
  return days <= 730 ? 'week' : 'month'
}
