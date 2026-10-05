// The words every side card's dialog shares. The ones for one card's story are in that feature's own copy.
import { defineCopy } from '../../i18n'
import { fmtInt } from '../../lib/format'

export const cardModal = defineCopy('cardModal', {
  close: 'Close',
  details: 'Details',
  none: 'Nothing in this period',
  inPeriod: 'This period',
  visitors: (n: number) => `${fmtInt(n)} ${n === 1 ? 'visitor' : 'visitors'}`,
  visitorsLabel: 'Visitors in this period',
})
