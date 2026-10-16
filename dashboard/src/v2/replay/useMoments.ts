// The moments of today for the replay, from what the page already knows: the source that rose (read by the hour), the
// mention found, the outages, and the first sales.
import type { Site } from '../../lib/api'
import { leadSource } from '../briefing/cards'
import { copy } from '../briefing/copy'
import { sourceName } from '../briefing/model'
import type { Extras } from '../briefing/useExtras'
import { useSlice } from '../briefing/useSeries'
import type { SliceData } from '../briefing/useSlices'
import { momentsOf, type Moment } from './model'

const SOLD = { first: copy.firstSale, upgrade: copy.anUpgrade, renewal: copy.aRenewal, more: copy.anotherSale }

export function useMoments(o: {
  site: Site
  today: string
  until: number
  slices: SliceData
  total: number
  extras: Extras
  incidents: { started_at: number; ended_at: number | null }[]
  /** Unix seconds of the site's midnight today. */
  dayStart: number
  sales: { at: number; amount: number; kind: 'first' | 'upgrade' | 'renewal' | 'more' }[]
  money?: (minor: number) => string
}): Moment[] {
  const lead = leadSource(o.slices.slices.referrer, o.total, o.site.domain)
  const hourly = useSlice(o.site, { from: o.today, to: o.today }, 'hour', lead ? { dim: 'referrer', value: lead.value } : null)
  const min = (unix: number) => Math.max(0, Math.round((unix - o.dayStart) / 60))
  return momentsOf({
    until: o.until,
    source: lead ? { name: sourceName(lead.value), hourly } : undefined,
    mention: o.extras.mention ? { host: o.extras.mention.source === 'hn' ? 'Hacker News' : o.extras.mention.host, min: min(o.extras.mention.posted_at) } : undefined,
    downs: o.incidents.filter((x) => x.started_at >= o.dayStart).map((x) => ({ min: min(x.started_at), len: x.ended_at === null ? null : Math.round((x.ended_at - x.started_at) / 60) })),
    sales: o.money ? o.sales.map((s) => ({ min: min(s.at), amount: (o.money as (n: number) => string)(s.amount), kind: s.kind })) : [],
    words: { starts: copy.startsSending, mention: copy.mentionAt, down: copy.siteDown, sale: (k, a) => SOLD[k](a) },
  })
}

