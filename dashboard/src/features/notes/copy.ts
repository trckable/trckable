// The words the chart's notes show on the first screen (listCopy.ts has the
// rest): the dashboard's text moves to message files when translations come,
// and this is what moves.
import { fmtDay } from '../../lib/dates'
import { defineCopy } from '../../i18n'

const count = (n: number) => (n === 1 ? '1 note' : `${n} notes`)

export const copy = defineCopy('notes', {
  // The markers on the chart.
  marker: (n: number, day: string) => `${count(n)} on ${fmtDay(day, { weekday: true })}`,
  by: (author: string) => `by ${author}`,
  more: (n: number) => `+ ${count(n)} more in the list`,
  add: 'Add note',
  list: 'Notes',
  openLabel: (n: number) => (n ? `Notes (${n})` : 'Notes'),
})
