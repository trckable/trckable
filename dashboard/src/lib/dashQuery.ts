// The report a dashboard asks for, from its address alone. The dashboard and
// the site switcher's prefetch both build it here, so a report fetched on
// hover is the very one the dashboard reads when it opens.
import { cachedReport, type ReportQuery, type Site } from './api'
import { calendarPrevious, diffDays, presetById, setWeekStart, todayIn, weekStartsOn, type Range } from './dates'
import { readView, type ViewState } from './url'
import { chartModel } from './tryout'

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
    channels: chartModel() === 'D' || undefined,
  }
}

/** Starts fetching the report a site's dashboard opens with, at the current
 *  address's period and filters: pointing at a site in the switcher does it,
 *  so the numbers are there by the click. */
export function prefetchSite(site: Pick<Site, 'id' | 'timezone' | 'week_start'>) {
  const view = readView(new URLSearchParams(location.search))
  if (view.live) return
  // "This week" depends on the site's first weekday; put the current one back.
  const was = weekStartsOn()
  setWeekStart(site.week_start)
  const q = queryOf(view, rangeOf(view, todayIn(site.timezone)))
  setWeekStart(was)
  void cachedReport(site.id, q).catch(() => undefined)
}
