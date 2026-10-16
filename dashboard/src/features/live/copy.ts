// Every word Live mode shows, in one place: the dashboard's text moves to
// message files when translations come, and this is what moves.
import { fmtInt } from '../../lib/format'
import { entryCopy } from './entryCopy'
import { defineCopy } from '../../i18n'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const copy = defineCopy('live', {
  // The Live view.
  region: entryCopy.live,
  onlineNow: entryCopy.onlineNow,
  title: 'Live',
  window: 'Last 30 minutes',
  loading: 'Loading the last 30 minutes…',
  failed: 'Couldn’t load the last 30 minutes. Trying again…',
  visitors30: 'Visitors, last 30 min',
  vsBefore: 'vs the 30 minutes before',
  chartLabel: (total: number) => `Pageviews per minute over the last 30 minutes: ${plural(total, 'pageview', 'pageviews')} in all. Arrow keys read one minute at a time, Enter opens it in Data`,
  sources: 'Top sources right now',
  other: 'Other',
  revenueToday: 'Revenue today',
  onSite: 'On the site right now',
  people: (n: number) => `${fmtInt(n)} ${n === 1 ? 'person' : 'people'}`,
  more: (n: number) => `and ${fmtInt(n)} more`,
  empty: 'Nobody on the site right now. New visits appear here as they happen.',
  quietSince: (when: string) => `Quiet since ${when}`,
  quietTip: 'No visit since then. New ones appear here as they happen.',
  help: 'How this list works',
  goal: (name: string) => `Goal: ${name}`,
  ago: (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000))
    if (s < 5) return 'just now'
    if (s < 60) return `${s} s ago`
    return `${Math.floor(s / 60)} min ago`
  },
  from: (source: string, device: string) => (device ? `${source} · ${device}` : source),
  active: 'Active in the last 30 seconds',
  footer: 'New visits slide in · visitors idle for 5 minutes leave',
  busier: (now: number, usual: number) => `Busier than usual: ${fmtInt(now)} vs ~${fmtInt(Math.round(usual))}.`,
  quieter: (now: number, usual: number) => `Quieter than usual: ${fmtInt(now)} vs ~${fmtInt(Math.round(usual))}.`,
  why: 'Why?',
  fromSource: (plus: number, source: string) => `+${fmtInt(plus)} from ${source}`,
  fromCountry: (plus: number, country: string) => `+${fmtInt(plus)} from ${country}`,
  inCampaign: (plus: number, campaign: string) => `+${fmtInt(plus)} from the campaign ${campaign}`,
  noOne: 'No single source stands out.',
  started: (at: string) => `since ${at}`,
  startedBefore: (at: string) => `since before ${at}`,
  going: 'still going',
})
