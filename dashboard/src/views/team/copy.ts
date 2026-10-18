// The words of the team overview (All sites). The site states use the list's own words (sites.menu: "quiet 7h", "down 23m").
import { defineCopy } from '../../i18n'

export const copy = defineCopy('team', {
  title: 'All sites',
  reading: 'Reading every site…',
  online: 'Online now',
  today: 'Today',
  revenue: 'Revenue today',
  attention: 'Need attention',
  allFine: 'All fine',
  vsUsual: 'vs usual',
  sortLabel: 'Sort sites',
  sort: { attention: 'Attention', traffic: 'Traffic', change: 'Change' },
  receiving: 'Receiving',
  notVerified: 'Not verified',
  more: (name: string) => `More for ${name}`,
  // The ⋯ menu. Share, Status page and Widgets are also the site list's (#421): one copy once it has merged.
  share: 'Share',
  statusPage: 'Status page',
  widgets: 'Widgets',
  add: 'Add a site',
  emptyTitle: 'No sites in this team yet',
  emptySub: 'Add the first one and its numbers show up here.',
  columns: { site: 'Site', online: 'Now', trend: 'Trend', today: 'Today', change: 'vs usual', source: 'Top source', revenue: 'Revenue' },
  trend: (name: string) => `${name}: visitors in the last 7 days`,
  // The briefing: one line for the day across the sites.
  briefAbove: (pct: number) => `The team is ${pct}% above usual today.`,
  briefBelow: (pct: number) => `The team is ${pct}% below usual today.`,
  briefSteady: 'The team is on its usual pace today.',
  briefToday: (n: string) => `${n} visitors across the sites so far.`,
  briefFlag: (names: string, plural: boolean) => `${names} ${plural ? 'need' : 'needs'} a look.`,
  briefAllFine: 'Every site is fine.',
  briefAnd: (a: string, b: string) => `${a} and ${b}`,
  briefMore: (a: string, b: string, n: number) => `${a}, ${b} and ${n} more`,
})
