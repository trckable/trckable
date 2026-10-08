// The words the date range popover's period panel says, in one place.
import type { Bucket } from '../lib/api'
import type { CompareMode } from '../lib/dates'
import { defineCopy } from '../i18n'

export const periodsCopy = defineCopy('range.periods', {
  panelLabel: 'Periods',
  more: 'More',
  compare: 'Compare',
  detail: 'Detail',
  auto: 'Auto',
  autoWith: (bucket: string) => `Auto · ${bucket}`,
  customDates: 'Custom dates',
})

// The six periods people pick most, then the rest under More (two columns,
// read across).
export { PERIODS_FIRST } from './periodIds'
export const PERIODS_MORE = ['12mo', 'wtd', 'mtd', 'lastmonth', 'ytd']

export const BUCKET_LABEL: Record<Bucket, string> = defineCopy('range.bucket', { hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly' })

export const calendarCopy = defineCopy('range.calendar', {
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
})

export const CMP_LABEL: Record<CompareMode, string> = defineCopy('range.compare', {
  none: 'No comparison',
  previous: 'Period before',
  year: 'Last year',
  custom: 'Custom',
})
