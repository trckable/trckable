// The words of the All sites page and its compare chart.
import { defineCopy } from '../i18n'

export const copy = defineCopy('allsites', {
  // The head.
  title: 'All sites',
  count: (n: number, period: string) => `${n} site${n === 1 ? '' : 's'} · last ${period}`,
  addSite: 'Add site',
  reading: 'Reading every site…',
  period: 'Period',
  last: (label: string) => `Last ${label}`,
  compare: 'Compare',
  compareLabel: 'Compare sites',
  // The feed.
  needs: 'Needs you',
  fine: (n: number) => (n === 1 ? 'Your site looks fine.' : `All ${n} sites look fine.`),
  quietTitle: (site: string, span: string) => `${site} has been quiet for ${span}`,
  downTitle: (site: string) => `${site} is down`,
  surgeTitle: (site: string) => `${site} is busier than usual`,
  surgeWhy: (online: number) => `${online} online now`,
  seeWhy: 'See why',
  openSite: 'Open site',
  // The row of controls.
  search: 'Search sites',
  sortLabel: 'Sort sites by',
  sort: (by: string) => `Sort: ${by}`,
  byVisitors: 'Visitors',
  byName: 'Name',
  newGroup: 'New group',
  noMatch: 'No site matches.',
  // The groups.
  other: 'Other',
  totals: (sites: number, visitors: string, money: string) => [`${sites} site${sites === 1 ? '' : 's'}`, `${visitors} visitors`, money].filter(Boolean).join(' · '),
  groupOptions: (g: string) => `${g}: group options`,
  // A site's tile.
  waiting: 'Waiting for the first visit',
  install: 'Install',
  unread: 'Could not be read',
  quietTag: (span: string) => `quiet ${span}`,
  downTag: 'down',
  steady: 'Steady',
  upOn: (days: number) => `Up on the ${days} days before`,
  downOn: (days: number) => `Down on the ${days} days before`,
  silent: (when: string) => `No visits since ${when}`,
  arrange: (name: string) => `${name}: move to a group`,
  // The compare chart.
  empty: 'No visits in this period yet.',
  label: 'Visitors per day, every site',
  otherSites: 'Other sites',
  all: 'All sites',
  visitors: 'Visitors',
  since: (day: string) => `Tracking since ${day}`,
})
