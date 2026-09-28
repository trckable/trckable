// The words the date range popover's period panel says, in one place.
import type { Bucket } from '../lib/api'
import type { CompareMode } from '../lib/dates'

export const periodsCopy = {
  panelLabel: 'Periods',
  compare: 'Compare with the period before',
  compareHint: 'A second line for the same stretch before',
  detail: 'Detail',
  auto: 'Auto',
  autoWith: (bucket: string) => `Auto · ${bucket}`,
  customDates: 'Custom dates',
  apply: 'Apply',
}

// The periods, in the three ways people think about time: what is happening,
// a rolling stretch, and the calendar's own weeks, months and years.
export const PERIOD_GROUPS = [
  { name: 'Live', ids: ['now', 'today', 'yesterday'] },
  { name: 'Rolling', ids: ['7d', '30d', '90d', '12mo'] },
  { name: 'Calendar', ids: ['wtd', 'mtd', 'lastmonth', 'ytd'] },
]

export const BUCKET_LABEL: Record<Bucket, string> = { hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly' }

export const calendarCopy = {
  dialog: 'Choose a date range',
  periods: 'Periods',
  daysBy: (days: number, by: string) => `${days} days · ${by}`,
  pickingCompare: 'Picking the comparison range',
  pickEnd: 'Now pick the end date',
  pickStart: 'Pick a start date, then an end date',
  compare: 'Compare',
  compareHint: 'A second line on the chart',
  editRange: 'Edit date range',
  editCompare: 'Edit comparison',
  cancel: 'Cancel',
  apply: 'Apply',
}

export const CMP_LABEL: Record<CompareMode, string> = {
  none: 'No comparison',
  previous: 'Period before',
  year: 'Last year',
  custom: 'Custom',
}
