// The words of the three cards under Live.
import { fmtInt } from '../../lib/format'
import { defineCopy } from '../../i18n'

export const cardsCopy = defineCopy('live.cards', {
  todayTitle: 'Today so far',
  vsLastWeek: 'vs this time last week',
  today: 'today',
  lastWeek: 'last week',
  chart: (now: number, then: number) => `Visitors today, ${fmtInt(now)} so far, against last week: ${fmtInt(then)} by the same time`,
  up: '▲',
  down: '▼',
  flat: '–',
  pagesTitle: 'Top pages right now',
  placesTitle: 'Where they’re from',
  mobile: 'Mobile',
  desktop: 'Desktop',
  open: (title: string) => `${title}: open in Data`,
  openPage: (page: string, n: number) => `${page}, ${fmtInt(n)} now: open in Data`,
  openPlace: (country: string, n: number) => `${country}, ${fmtInt(n)} now: open in Data`,
})
