// The room the main chart will take, kept while its report loads, so the page
// below it does not jump when the numbers arrive. What is not known yet is
// guessed from what is: a shared link carries its modules, and a signed-in
// dashboard remembers, per site, whether the chart last had a revenue plot.
import { useEffect } from 'react'
import { SPLIT_H } from '../../charts/moneyPlot'
import { CHART_H, LANE_H } from '../../charts/plot'
import { diffDays, type Range } from '../../lib/dates'
import { isShared } from '../../lib/me'
import { shows, type Mods } from '../../lib/modules'
import type { ViewState } from '../../lib/url'

/** The scrubber's row: its own height and the gap above it (Overview.css). */
const SCRUB_ROW = 28 + 12

const memo = (site: string) => 'trckable:revenue-plot:' + site

function remembered(site: string): boolean | null {
  if (isShared()) return null
  try {
    const v = localStorage.getItem(memo(site))
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

/** Whether the chart will have a revenue plot: the remembered answer for
 *  this site, else what its modules say. */
function expectsRevenue(site: string, mods: Mods): boolean {
  return remembered(site) ?? (mods !== null && shows(mods, 'cards', 'revenue'))
}

/** Remembers, once a report is in, whether the chart had a revenue plot. */
function useRememberRevenue(site: string, loaded: boolean, has: boolean) {
  useEffect(() => {
    if (!loaded || isShared()) return
    try {
      localStorage.setItem(memo(site), has ? '1' : '0')
    } catch {
      /* private mode: the guess just starts from the modules next time */
    }
  }, [site, loaded, has])
}

/** Whether the replay scrubber will sit under the chart: by day, over more than one. */
export function expectsScrub(view: Pick<ViewState, 'bucket'>, range: Range): boolean {
  const days = diffDays(range.from, range.to) + 1
  // Without a choice of its own, the server draws 3 to 120 days by the day (2 or fewer by the hour).
  const byDay = view.bucket ? view.bucket === 'day' : days > 2 && days <= 120
  return days > 1 && byDay
}

interface Hold {
  site: string
  mods: Mods
  narrow: boolean
  view: Pick<ViewState, 'bucket'>
  range: Range
  /** The report is in, and whether its chart has a revenue plot. */
  loaded: boolean
  hasRevenue: boolean
}

/** What the page keeps ready for the chart before its report arrives: the
 *  height of the placeholder that stands where the chart, its revenue plot
 *  and its scrubber will be, and whether the key numbers keep revenue's places. */
export function useChartHold(o: Hold): { height: number; revenue: boolean } {
  useRememberRevenue(o.site, o.loaded, o.hasRevenue)
  const revenue = expectsRevenue(o.site, o.mods)
  const scrub = expectsScrub(o.view, o.range)
  return { height: (o.narrow ? 170 : CHART_H) + (isShared() ? 0 : LANE_H) + (revenue ? SPLIT_H : 0) + (scrub ? SCRUB_ROW : 0), revenue }
}
