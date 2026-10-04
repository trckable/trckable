// The chart kit's own words: the card's table switch. Everything a chart says
// about its data comes from the feature that draws it.
import { defineCopy } from '../i18n'

export const kitCopy = defineCopy('chart.kit', {
  failed: "Couldn't draw this.",
  reload: 'Reload',
  updated: 'Updated, reloading…',
  visitors: 'Visitors',
  revenue: 'Revenue',
  up: '▲',
  down: '▼',
  flat: '–',
})

// The main time chart's words.
export const timeCopy = defineCopy('chart.time', {
  chart: (metric: string, n: number, peak: string) => `${metric} over time: ${n} points, peak ${peak}. Arrow keys move through the buckets.`,
  note: 'Note',
  addNote: 'Add a note on this day',
  addNoteOn: (day: string) => `Add a note on ${day}`,
  peak: (value: string, when: string) => `${value} · ${when}`,
  noSales: 'No sales',
  soFar: 'so far',
  revenue: 'Revenue',
  noSalesPeriod: 'No sales in this period',
})
