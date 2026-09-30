// Clicking a note shows its day on the chart. A day inside the period on
// screen, charted by day, is picked where it is; any other day opens a month
// around it (never past today), charted by day, with that day picked.
import { addDays, type ISODate, type Range } from '../../lib/dates'
import { setView, type ViewState } from '../../lib/url'

const EVENT = 'trckable:note-day'

export function jumpPatch(day: ISODate, range: Range, byDay: boolean, today: ISODate): Partial<ViewState> {
  if (byDay && day >= range.from && day <= range.to) return { day }
  const to = addDays(day, 14) > today ? today : addDays(day, 14)
  return { period: 'custom', from: addDays(to, -29), to, bucket: undefined, day, live: false }
}

/** From outside the dashboard (Settings, over it): ask it to show a day. */
export function askJump(day: ISODate) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: day }))
}

/** The dashboard's side: the day asked for, shown the same way. */
export function listenJump(on: (day: ISODate) => void): () => void {
  const h = (e: Event) => on((e as CustomEvent<string>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}

export const jump = (day: ISODate, range: Range, byDay: boolean, today: ISODate) => setView(jumpPatch(day, range, byDay, today))
