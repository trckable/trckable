// The words of the All sites page.
import { defineCopy } from '../i18n'

export const copy = defineCopy('allsites', {
  // The head.
  title: 'All sites',
  count: (n: number, period: string) => `${n} site${n === 1 ? '' : 's'} · last ${period}`,
  addSite: 'Add site',
  reading: 'Reading every site…',
  period: 'Period',
  last: (label: string) => `Last ${label}`,
  // A site's tile.
  wallLabel: 'Sites, live',
  online: (n: number) => `${n} online`,
  nobody: 'Nobody online',
  visitors: 'Visitors',
  lastVisit: (when: string) => `Last visit ${when}`,
  waiting: 'Waiting for the first visit',
  install: 'Install',
  unread: 'Could not be read',
  quietTag: (span: string) => `quiet ${span}`,
  downTag: 'down',
})
