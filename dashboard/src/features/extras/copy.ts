// Every word of the Data view's extras: the pace line, the lines the chart's
// moments say, Highlights, the revenue tabs, Latest buyers and AI assistants. Messages with
// the rest of the dashboard's words, for when translations come.
import { fmtInt, fmtPct } from '../../lib/format'

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`
const times = (f: number) => `${f.toFixed(1)}×`

export const extrasCopy = {
  pace: (total: string) => `On pace for ~${total} this month`,
  /** What a spike or a burst of sales says (the moments on the chart). */
  ring: {
    spike: (factor: number) => `Spike · ${times(factor)} the usual`,
    from: (referrer: string) => `mostly from ${referrer}`,
    sales: (count: number, amount: string) => `${plural(count, 'sale', 'sales')} · ${amount}`,
    burst: (factor: number) => `Sales burst · ${times(factor)} the usual`,
    mostly: (channel: string) => `mostly ${channel}`,
  },
  highlights: {
    tab: 'Highlights',
    label: 'What changed, against the period before',
    moved: (name: string, change: number, now: number, was: number) =>
      `${name} ${change >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(change))} · ${fmtInt(was)} → ${fmtInt(now)} visitors`,
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
  buyers: {
    tab: 'Latest buyers',
    failed: 'Couldn’t read the latest buyers.',
    none: 'No sales in this period.',
    direct: 'Direct',
    paid: 'paid',
    visits: (n: number) => plural(n, 'visit', 'visits'),
    toBuy: (s: number) => {
      const hours = s / 3600
      if (hours < 1) return 'same hour'
      if (hours < 24) return 'same day'
      return plural(Math.round(hours / 24), 'day', 'days')
    },
    ago: (s: number) => {
      if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
      if (s < 86400) return `${Math.round(s / 3600)} h ago`
      return `${Math.round(s / 86400)} d ago`
    },
  },
  ai: {
    tab: 'AI',
    label: 'Visitors from AI assistants',
    share: (pct: string) => `${pct} of all visitors`,
    trend: 'Visitors from AI assistants, day by day',
    assistant: 'Assistant',
    none: 'No visit from an AI assistant in this period.',
    pick: (name: string, host: string) => `${name}: filter by ${host}`,
  },
}
