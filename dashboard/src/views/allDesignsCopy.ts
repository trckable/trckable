// The words of the three All sites designs (?design=a|b|c): the live wall, the
// ranked chart and the morning briefing.
import { defineCopy } from '../i18n'

export const copy = defineCopy('alldesigns', {
  // The live wall.
  online: (n: number) => `${n} online`,
  nobody: 'Nobody online',
  lastVisit: (when: string) => `Last visit ${when}`,
  wallLabel: 'Sites, live',
  // The ranked chart.
  visitors: 'Visitors',
  revenue: 'Revenue',
  chartLabel: 'Visitors per day, every site stacked',
  rank: 'Rank',
  site: 'Site',
  change: 'Change',
  share: 'Share',
  line: 'Trend',
  other: 'Other sites',
  tableLabel: 'Sites ranked by visitors',
  // The briefing.
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  total: (visitors: string, period: string) => `Your sites had ${visitors} visitors in the last ${period}.`,
  totalMove: (visitors: string, period: string, up: boolean, pct: string, days: number) => `Your sites had ${visitors} visitors in the last ${period}, ${up ? 'up' : 'down'} ${pct}% on the ${days} days before.`,
  grew: (site: string, by: string) => `${site} grew most, by ${by} visitors.`,
  fell: (site: string, by: string) => `${site} fell most, by ${by} visitors.`,
  earned: (money: string) => `Together they earned ${money}.`,
  onlineNow: (n: number, sites: number) => `${n} ${n === 1 ? 'person is' : 'people are'} online right now, on ${sites} ${sites === 1 ? 'site' : 'sites'}.`,
  rightNow: (line: string) => `Right now: ${line.charAt(0).toLowerCase()}${line.slice(1)}`,
  onlineLabel: 'Online now',
  downLine: (site: string, since: string) => (since ? `${site} is down since ${since}.` : `${site} is down.`),
  quietLine: (site: string, span: string) => `${site} has had no visits for ${span}.`,
  briefing: 'Morning briefing',
  allFine: 'Nothing needs you.',
  chips: 'Sites',
  noVisits: 'No visits',
})
