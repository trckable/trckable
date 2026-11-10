// Every word of the Data view's extras: the lines the chart's
// moments say, Highlights, the revenue tabs, Latest buyers. Messages with
// the rest of the dashboard's words, for when translations come.
import { fmtInt, fmtPct } from '../../lib/format'
import { times } from '../../lib/times'
import { defineCopy } from '../../i18n'

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`

export const extrasCopy = defineCopy('extras', {
  /** What a spike or a burst of sales says (the moments on the chart). */
  ring: {
    spike: (factor: number) => `Spike · ${times(factor)} the usual`,
    /** A spike on a site whose usual is too small for a multiplier: the count says it. */
    newTraffic: (visitors: number) => `New traffic · ${plural(visitors, 'visitor', 'visitors')}`,
    from: (referrer: string) => `mostly from ${referrer}`,
    burst: (factor: number) => `Sales burst · ${times(factor)} the usual`,
    mostly: (channel: string) => `mostly ${channel}`,
  },
  highlights: {
    tab: 'Highlights',
    label: 'What changed, against the period before',
    failed: 'Couldn’t read what changed.',
    // `by`: the percentage only where the earlier figure can carry one (lib/thin): a handful before is just "up", ten times over is "more than 10x".
    moved: (name: string, change: number, now: number, was: number, by: 'percent' | 'capped' | 'bare') => {
      const dir = change >= 0 ? 'up' : 'down'
      const how = { percent: ` ${fmtPct(Math.abs(change))}`, capped: ' more than 10x', bare: '' }[by]
      return `${name} ${dir}${how} · ${fmtInt(was)} → ${fmtInt(now)} visitors`
    },
    pays: (name: string, each: string, multiple: number) => `${name} earns ${each} a visitor, ${times(multiple)} the average`,
    drop: (page: string, was: number, now: number) => `${page} converts ${fmtPct(now)}, was ${fmtPct(was)}`,
    fresh: (referrer: string, visitors: number) => `New referrer: ${referrer} sent ${plural(visitors, 'visitor', 'visitors')}`,
    filter: (what: string) => `Filter by ${what}`,
  },
  sells: {
    tab: 'Pages that sell',
    page: 'Page',
    label: 'Revenue from visits that read each page',
    note: 'A sale counts under every page of the visit that earned it.',
    none: 'No sale is credited to a page yet.',
    failed: 'Couldn’t read the pages that sell.',
  },
})
