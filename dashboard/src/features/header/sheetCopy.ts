// The phone sheet's words (PhoneSheet.tsx); they load with it, not with the page.
export const sheetCopy = {
  sheet: 'View options',
  done: 'Done',
  periods: 'Periods',
  quick: { today: 'Today', '7d': '7d', '30d': '30d' } as Record<string, string>,
  more: 'More',
  compareRow: 'Compare',
  filtersRow: 'Filters',
  removeFilter: (text: string) => `Remove ${text}`,
}
