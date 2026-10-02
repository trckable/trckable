// The report a dashboard asks for, from its address alone. The dashboard and
// the site switcher's prefetch both build it here, so a report fetched on
// hover is the very one the dashboard reads when it opens.
import { cachedReport, type ReportQuery, type Site } from './api'
import { calendarPrevious, diffDays, presetById, setWeekStart, todayIn, weekStartsOn, type Range } from './dates'
import { readView, wantsLive, type ViewState } from './url'

export function rangeOf(view: ViewState, today: string): Range {
  if (view.period === 'custom' && view.from && view.to) return { from: view.from, to: view.to > today ? today : view.to }
  // An unknown period falls back to the last 30 days (always a preset).
  return (presetById(view.period) ?? presetById('30d'))?.range(today) ?? { from: today, to: today }
}

// The tiles always show the change against the period before, so it is
// always asked for, in the same request; the chart draws it as a line only
// when Compare is on. A calendar period is compared with the same stretch of
// the one before (lib/dates.ts), which the server takes as a custom comparison.
export function queryOf(view: ViewState, range: Range): ReportQuery {
  const mode = view.compare === 'none' ? 'previous' : view.compare
  const calPrev = mode === 'previous' ? calendarPrevious(view.period, range) : null
  const days = diffDays(range.from, range.to)
  return {
    from: range.from,
    to: range.to,
    compare: calPrev ? 'custom' : mode,
    cfrom: calPrev ? calPrev.from : view.cfrom,
    cto: calPrev ? calPrev.to : view.cto,
    filters: view.filters,
    daily: days >= 1 && days < 400,
    testPayments: view.test,
    bucket: view.bucket,
    attr: view.attr,
    deep: view.mode === 'full',
  }
}

/** Whether the page shows change figures (the tiles, the lists' arrows, the chips): only while a comparison is on. "No comparison" says none of them, so the tiles, the cards, the file and the chips never disagree. */
export const showsChange = (view: ViewState): boolean => view.compare !== 'none'

/** The query a CSV export asks with: the page's own, without the comparison when none is on (the file then has no comparison row either). */
export function exportQuery(view: ViewState, query: ReportQuery): ReportQuery {
  return showsChange(view) ? query : { ...query, compare: undefined, cfrom: undefined, cto: undefined }
}

/** Starts fetching the report a site's dashboard opens with, at the current
 *  address's period and filters: pointing at a site in the switcher does it,
 *  so the numbers are there by the click, and so does the page's start-up
 *  (lib/earlyStart.ts). */
export function prefetchSite(site: Pick<Site, 'id' | 'timezone' | 'week_start'> & { last_event_at?: number }, params = new URLSearchParams(location.search)) {
  const view = readView(params)
  if (wantsLive(view, site)) return
  // "This week" depends on the site's first weekday; put the current one back.
  const was = weekStartsOn()
  setWeekStart(site.week_start)
  const q = queryOf(view, rangeOf(view, todayIn(site.timezone)))
  setWeekStart(was)
  void cachedReport(site.id, q).catch(() => undefined)
}

/** Starts fetching the periods the picker offers first (Today, 7, 30 and 90
 *  days) as they would open from the current address, with its filters and
 *  comparison: picking one then shows its numbers at once. The one already
 *  chosen is skipped, and Now, which is the live view, has no report. */
export function prefetchPeriods(site: string, timezone: string, ids: string[]) {
  const view = readView(new URLSearchParams(location.search))
  const today = todayIn(timezone)
  for (const id of ids) {
    if (id === 'now' || id === view.period) continue
    // Leaving Now leaves its hourly detail behind, as picking a period does.
    const next = { ...view, period: id, from: undefined, to: undefined, day: undefined, bucket: view.period === 'now' ? undefined : view.bucket }
    void cachedReport(site, queryOf(next, rangeOf(next, today))).catch(() => undefined)
  }
}
