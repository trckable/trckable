// The Data view's overview words: its tiles and the main chart's head. What
// moves to the message files when translations come.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('overview', {
  replay: 'Replay this period day by day',
  replayByHour: 'Replay this period hour by hour',
  replayByDay: 'Replay this period day by day (switches the chart to days)',
  pause: 'Pause replay',
  scrub: 'Scrub through the period',
  wholePeriod: 'the whole period',
  backToPeriod: (day: string) => `Viewing ${day}: back to the whole period`,
  chartTile: (label: string) => `Chart ${label.toLowerCase()}`,
  change: (label: string, vs: string) => `${label} ${vs}`,
  keyNumbers: 'Key numbers',
  revenue: 'Revenue',
  visitors: 'Visitors',
  pageviews: 'Pageviews',
  bounce: 'Bounce rate',
  session: 'Session time',
  perVisitorTile: 'Per visitor',
  conversion: 'Paid conversion',
  // What each tile's number is, in a tooltip that opens on hover, focus or tap.
  tips: {
    visitors: 'People who came in this period. Bots are filtered out.',
    revenue: 'Money from sales matched to a visit in this period.',
    conversion: 'Share of visitors who paid (buyers / visitors).',
    perVisitor: 'Revenue divided by visitors.',
    pageviews: 'Pages opened in this period.',
    bounce: 'Share of visits that saw one page and left. Lower is better.',
    session: "Average time from a visit's first page to its last.",
    tooFew: 'Too few visits yet',
  },
  moved: (label: string, vs: string, verdict: string) => `Bounce rate is ${label} ${vs}: ${verdict}.`,
  worse: 'worse',
  better: 'better',
  noChangeDays: (n: number) => `No change shown: the period before had only ${n} ${n === 1 ? 'day' : 'days'} of data.`,
  noChangeFew: (n: number) => `No change shown: the period before had only ${n} ${n === 1 ? 'visitor' : 'visitors'}.`,
  botsFiltered: (n: string) => `${n} bots and AI crawlers filtered`,
  botFiltered: '1 bot or AI crawler filtered',
  imported: 'Imported',
  importedRange: (from: string, to: string) => (from === to ? from : `${from} – ${to}`),
})
