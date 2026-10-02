// The Data view's overview words: its tiles and the main chart's head. What
// moves to the message files when translations come.
export const copy = {
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
  conversion: 'Conversion',
}
