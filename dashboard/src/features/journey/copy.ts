// Every word the visitor journey shows, in one place: the dashboard's text
// moves to message files when translations come, and this is what moves.
import { channelLabel } from '../../lib/palette'
import { defineCopy } from '../../i18n'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const copy = defineCopy('journey', {
  dialog: 'Visitor journey',
  title: (id: string) => `Visitor ${id}`,
  loading: 'Loading this visitor’s journey…',
  failed: (why: string) => `Couldn’t load this journey: ${why}`,
  empty: 'No visits recorded for this visitor in this period.',
  close: 'Close',
  options: 'Visitor options',

  // The identity card.
  returning: 'Returning',
  new: 'New',
  onSiteNow: 'On the site now',
  viewing: 'Viewing',
  firstSeen: 'First seen',
  lastSeen: 'Last seen',
  visits: 'Visits',
  dayTime: (day: string, time: string) => `${day}, ${time}`,
  viewsFor: (n: number, time: string) => `${plural(n, 'view', 'views')} · ${time}`,
  timeOnSite: 'Time on site',
  paid: 'Paid',
  refunded: (amount: string) => `${amount} refunded`,
  creditedTo: 'Credited to',
  unknownPlace: 'Unknown place',
  unknownDevice: 'Unknown device',

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
  via: (provider: string) => `via ${provider}`,
  exit: 'Left',
  here: 'Here now',
  older: 'Older visits are not shown.',
  noPages: 'No pages recorded in this visit.',

  // The menu.
  copyId: 'Copy visitor id',
  copied: 'Visitor id copied',
  copyFailed: 'Couldn’t copy the id',
  dataRequest: 'Data request…',
  dataRequestHint: 'Export or erase everything held about this visitor',
  erase: 'Erase visitor…',
})
