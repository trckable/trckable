// The words of the All sites page.
import { defineCopy } from '../i18n'

export const copy = defineCopy('allsites', {
  // The head.
  title: 'Sites',
  reading: 'Reading every site…',
  periodLabel: (days: number) => (days === 365 ? 'Last 12 months' : `Last ${days} days`),
  summary: (period: string, lens: string, sites: string) => `${period} · ${lens} · ${sites}`,
  siteCount: (n: number) => `${n} site${n === 1 ? '' : 's'}`,
  siteCountOf: (n: number, all: number) => `${n} of ${all} sites`,
  // The View menu.
  view: 'View',
  viewLabel: 'How to look at all sites',
  period: 'Period',
  show: 'Show',
  lensVisitors: 'Visitors',
  lensRevenue: 'Revenue',
  sites: 'Sites',
  all: 'All',
  none: 'None',
  layout: 'Layout',
  layoutOverview: 'Overview',
  layoutTable: 'Table',
  reset: 'Reset',
})
