// The Data view's overview words: its tiles and the main chart's head. What
// moves to the message files when translations come.
export const copy = {
  since: (day: string) => `since ${day}`,
  showSince: (day: string) => `Show since ${day}`,
  showSinceTitle: (day: string) => `Set the period to ${day} until today`,
  replay: 'Replay this period day by day',
  replayByHour: 'Replay this period hour by hour',
  replayByDay: 'Replay this period day by day (switches the chart to days)',
  pause: 'Pause replay',
  scrub: 'Scrub through the period',
  wholePeriod: 'the whole period',
  backToPeriod: (day: string) => `Viewing ${day}: back to the whole period`,
  chartTile: (label: string) => `Chart ${label.toLowerCase()}`,
  isNew: 'new',
  newLabel: (vs: string) => `new: nothing ${vs.replace(/^vs /, 'in the ')}`,
  change: (label: string, vs: string) => `${label} ${vs}`,
}
