// "Open this thing": one place that says where a click on a source, referrer, campaign, page, country, device, browser or
// goal leads. It opens Explore's report that tells about it (Overview narrowed to it, the goal's own table for a goal),
// never What changed, and a click that comes from a visit or from Live opens a period that holds that visit.
import type { Filter } from '../../lib/api'
import { diffDays, todayIn, type ISODate } from '../../lib/dates'
import { browserZone } from '../../lib/format'
import { setView, type ViewState } from '../../lib/url'
import { openExplore } from './open'
import type { Tab } from './types'

export type Thing =
  | { kind: 'source'; channel: string; referrer?: string }
  | { kind: 'referrer' | 'channel' | 'campaign' | 'page' | 'country' | 'device' | 'browser' | 'goal'; value: string }

export interface Target {
  tab: Tab
  filters: Filter[]
}

/** Fewer visitors than this in Today and there is too little to read: the last 7 days are opened instead. */
export const TODAY_MIN = 10

/** The filter a thing stands for. A source named by its referrer is that referrer, not only its channel. */
export function filterOf(t: Thing): Filter {
  if (t.kind === 'source') return t.referrer ? { dim: 'referrer', value: t.referrer } : { dim: 'channel', value: t.channel }
  return { dim: t.kind, value: t.value }
}

/** Where a thing opens: the report that answers "tell me about it", narrowed to it. */
export function targetOf(t: Thing, tab?: Tab): Target {
  return { tab: tab ?? (t.kind === 'goal' ? 'funnels' : 'overview'), filters: [filterOf(t)] }
}

const here = browserZone

/** The period that holds a moment (unix ms) as of `now`: Today when it was today and Today has enough in it, otherwise the smallest of the last 7, 30 or 90 days, or 12 months, that holds it. */
export function periodHolding(at: number, tz: string, todayVisitors?: number, now = new Date()): Pick<ViewState, 'period'> {
  const day: ISODate = todayIn(tz, new Date(at))
  const ago = diffDays(day, todayIn(tz, now))
  if (ago <= 0 && (todayVisitors ?? 0) >= TODAY_MIN) return { period: 'today' }
  if (ago < 7) return { period: '7d' }
  if (ago < 30) return { period: '30d' }
  if (ago < 90) return { period: '90d' }
  return { period: '12mo' }
}

export interface OpenOptions {
  /** A table other than the thing's own report (the speed table for a page's speed). */
  tab?: Tab
  /** Set when the click comes from a visit or from Live: the visit's moment (unix ms) and its site's time zone (the browser's when none is given), so the period holds it. */
  visit?: { at: number; tz?: string; todayVisitors?: number }
}

/** What the address says to open a thing from a visit: its report, narrowed to it, over a period that holds the visit. */
export function viewOf(t: Thing, o: OpenOptions & { visit: NonNullable<OpenOptions['visit']> }): Partial<ViewState> {
  const { tab, filters } = targetOf(t, o.tab)
  const { period } = periodHolding(o.visit.at, o.visit.tz ?? here(), o.visit.todayVisitors)
  return { xp: tab, xf: filters, live: false, period, from: undefined, to: undefined, bucket: undefined, day: undefined }
}

/** Open a thing in Explore. A click from a visit also sets the period; any other click keeps the period it is on. */
export function openThing(t: Thing, o: OpenOptions = {}) {
  if (o.visit) {
    setView(viewOf(t, { ...o, visit: o.visit }))
    return
  }
  const { tab, filters } = targetOf(t, o.tab)
  openExplore(tab, filters)
}
