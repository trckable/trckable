// Every word Live mode shows, in one place: the dashboard's text moves to
// message files when translations come, and this is what moves.
import { fmtInt } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { entryCopy } from './entryCopy'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const copy = {
  // The Live view.
  region: entryCopy.live,
  onlineNow: entryCopy.onlineNow,
  title: 'Live · last 30 minutes',
  rightNow: 'Right now · updates on its own',
  reconnecting: 'Reconnecting…',
  loading: 'Loading the last 30 minutes…',
  failed: 'Couldn’t load the last 30 minutes. Trying again…',
  visitors30: 'Visitors, last 30 min',
  vsBefore: 'vs the 30 minutes before',
  chartLabel: (total: number) => `Pageviews per minute over the last 30 minutes: ${plural(total, 'pageview', 'pageviews')} in all. Arrow keys read one minute at a time, Enter opens it in Data`,
  chartStart: '30 min ago',
  chartEnd: 'now',
  minuteAgo: (m: number) => (m === 0 ? 'This minute' : `${m} min ago`),
  minuteViews: (n: string, count: number) => `${n} ${count === 1 ? 'pageview' : 'pageviews'}`,
  sources: 'Top sources right now',
  noSources: 'No visits in the last 30 minutes.',
  other: 'Other',
  sourceLabel: (channel: string) => channelLabel(channel),
  revenueToday: 'Revenue today',
  sold: (amount: string) => `+ ${amount} just now`,

  // Who is on the site.
  onSite: 'On the site right now',
  people: (n: number) => `${fmtInt(n)} ${n === 1 ? 'person' : 'people'}`,
  empty: 'Nobody on the site right now. New visits appear here as they happen.',
  goal: (name: string) => `Goal: ${name}`,
  ago: (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000))
    if (s < 5) return 'just now'
    if (s < 60) return `${s} s ago`
    return `${Math.floor(s / 60)} min ago`
  },
  agoShort: (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000))
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m`
  },
  openJourney: 'See this visitor’s whole journey',
  from: (source: string, device: string) => (device ? `${source} · ${device}` : source),
  active: 'Active in the last 30 seconds',
  footer: 'New visits slide in · visitors idle for 5 minutes leave',
  announce: (page: string, source: string) => `New visit: ${page}, from ${source}`,
  announceMany: (n: number) => `${n} new visits`,
}
