// The filter chips' words (FilterRow.tsx, ActiveFilters.tsx); they load with
// them, not with the page.
import { defineCopy } from '../../i18n'

export const rowCopy = defineCopy('header.row', {
  active: 'Active filters',
  is: 'is',
  isNot: 'is not',
  /** Between the values of one dimension: "Country is DE or AT". */
  or: ' or ',
  flip: (dim: string, not: boolean) => (not ? `${dim} is not: change to is` : `${dim} is: change to is not`),
  removeSet: (dim: string, op: string, value: string) => `Remove filter ${dim} ${op} ${value}`,
  title: 'Filters',
  inForce: (n: number) => `${n} in force`,
  more: (n: number) => `+${n} more`,
  count: (n: number) => `${n} filter${n === 1 ? '' : 's'}`,
  clear: 'Clear all',
  saveOne: 'Save view',
  saveOneTitle: 'Save these filters as a view',
  saveSegment: 'Save as segment?',
  saveSegmentTitle: 'Keep these filters as a segment, to open in one click',
  saveInMenu: 'Save as segment',
  saveInMenuOne: 'Save this view',
})
