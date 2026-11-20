// Every word the visitor journey shows, in one place: the dashboard's text
// moves to message files when translations come, and this is what moves.
import { channelLabel } from '../../lib/palette'
import { defineCopy } from '../../i18n'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const copy = defineCopy('journey', {
  dialog: 'Visitor journey',
  loading: 'Loading this visitor’s journey…',
  failed: (why: string) => `Couldn’t load this journey: ${why}`,
  retry: 'Try again',
  empty: 'No visits recorded for this visitor in this period.',
  close: 'Close',
  options: 'Visitor options',

  // The identity card.
  onSiteNow: 'On the site now',
  viewing: 'Viewing',
  dayTime: (day: string, time: string) => `${day}, ${time}`,
  viewsFor: (n: number, time: string) => `${plural(n, 'view', 'views')} · ${time}`,
  firstVisit: (time: string) => `First visit · ${time}`,
  visitsSince: (n: string, since: string, time: string) => `${n} visits since ${since} · ${time}`,
  appNamed: (app: string) => `${app} app`,
  visits: 'Visits',
  timeOnSite: 'Time on site',
  unknownPlace: 'Unknown place',
  unknownDevice: 'Unknown device',
  paid: 'Paid',
  refunded: (amount: string) => `${amount} refunded`,
  creditedTo: 'Credited to',

  // The timeline.
  visitsLabel: 'Visits, newest first',
  visit: (n: number) => `Visit ${n}`,
  visitEvents: (n: number) => `Visit ${n}, what they did`,
  source: (channel: string, referrer: string) => (referrer ? `${channelLabel(channel)} · ${referrer}` : channelLabel(channel)),
  filterSource: (what: string) => `Filter the dashboard to ${what}`,
  filterPage: (path: string) => `Filter the dashboard to ${path}`,
  times: (n: number) => `×${n}`,
  timesLabel: (n: number) => `viewed ${n} times in a row`,
  offset: (d: string) => `+${d}`,
  stayed: (d: string) => `${d} on page`,
  goal: 'Goal',
  payment: 'Payment',
  prop: (key: string, value: string) => `${key.charAt(0).toUpperCase()}${key.slice(1)}: ${value}`,
  formKey: 'Form',
  via: (provider: string) => `via ${provider}`,
  exit: 'Left',
  here: 'Here now',
  older: 'Older visits are not shown.',
  noPages: 'No pages recorded in this visit.',
  morePages: (n: number) => `+${plural(n, 'page', 'pages')}`,
  earlierVisits: (n: number) => plural(n, 'earlier visit', 'earlier visits'),
  moreEvents: (n: number) => `+${n} more`,

  // The menu.
  copyId: 'Copy visitor id',
  copied: 'Visitor id copied',
  copyFailed: 'Couldn’t copy the id',
  dataRequest: 'Data request…',
  dataRequestHint: 'Export or erase everything held about this visitor',
  erase: 'Erase visitor…',
})
