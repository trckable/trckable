// The chart kit's own words: the card's table switch. Everything a chart says
// about its data comes from the feature that draws it.
export const kitCopy = {
  table: 'Table',
  chart: 'Chart',
  showTable: (title: string) => `${title}: show as a table`,
  showChart: (title: string) => `${title}: show as a chart`,
  empty: 'Nothing to show for this period yet.',
}

// The main time chart's words.
export const timeCopy = {
  chart: (metric: string, n: number, peak: string) => `${metric} over time: ${n} points, peak ${peak}. Arrow keys move through the buckets.`,
  note: 'Note',
  addNote: 'Add a note on this day',
  addNoteOn: (day: string) => `Add a note on ${day}`,
  peak: (value: string, when: string) => `${value} · ${when}`,
  noSales: 'No sales',
  revenue: 'Revenue',
  noSalesPeriod: 'No sales in this period',
}
