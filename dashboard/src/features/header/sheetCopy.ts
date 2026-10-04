// The phone sheet's words (PhoneSheet.tsx); they load with it, not with the page.
import { defineCopy } from '../../i18n'

const quick: Record<string, string> = { today: 'Today', '7d': '7d', '30d': '30d', '90d': '90d' }

export const sheetCopy = defineCopy('header.sheet', {
  sheet: 'View options',
  done: 'Done',
  periods: 'Periods',
  quick,
  more: 'More',
  compareRow: 'Compare',
  filtersRow: 'Filters',
  add: 'Add',
})
