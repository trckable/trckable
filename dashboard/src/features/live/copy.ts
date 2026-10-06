// Every word Live mode shows, in one place: the dashboard's text moves to
// message files when translations come, and this is what moves.
import { fmtInt } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { entryCopy } from './entryCopy'
import { defineCopy } from '../../i18n'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const copy = defineCopy('live', {
  // The Live view.
  region: entryCopy.live,
  onlineNow: entryCopy.onlineNow,
  title: 'Live',
  window: 'Last 30 minutes',
  regionNow: 'Live, last 30 minutes',
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
  more: (n: number) => `and ${fmtInt(n)} more`,
  stillHere: 'Still on the site',
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

  // Busier than usual: one quiet line, and what is behind it.
  busier: (now: number, usual: number) => `Busier than usual: ${fmtInt(now)} vs ~${fmtInt(Math.round(usual))}.`,
  quieter: (now: number, usual: number) => `Quieter than usual: ${fmtInt(now)} vs ~${fmtInt(Math.round(usual))}.`,
  why: 'Why?',
  whyTitle: 'Why is it busier than usual?',
  fromSource: (plus: number, source: string) => `+${fmtInt(plus)} from ${source}`,
  mostly: (page: string) => `mostly ${page}`,
  onPage: (plus: number, page: string) => `+${fmtInt(plus)} on ${page}`,
  fromCountry: (plus: number, country: string) => `+${fmtInt(plus)} from ${country}`,
  inCampaign: (plus: number, campaign: string) => `+${fmtInt(plus)} from the campaign ${campaign}`,
  restUsual: 'the rest as usual',
  restElse: (n: number) => `+${fmtInt(n)} from elsewhere`,
  noOne: 'No single source stands out.',
  started: (at: string) => `Started ${at}`,
  startedBefore: (at: string) => `Since before ${at}`,
  going: 'still going',
})
