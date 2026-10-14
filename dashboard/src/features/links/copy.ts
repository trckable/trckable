// The words of the Your links page: the menu item, the page, its rows and its empty state.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('yourLinks', {
  title: 'Your links',
  back: 'Back to the dashboard',
  failed: 'Could not read your links. Try again.',
  tip: 'Add ?ref=name to any link you share, or use utm_source. Each name becomes a row here with who it brought.',
  open: (name: string) => `Show only ${name}`,
  visitors: 'Visitors',
  visitorsOf: (n: string) => `${n} visitors`,
  goals: (n: string) => `${n} reached a goal`,
  revenue: 'Revenue from this link',
  spark: 'Visitors per day, last 30 days',
  last: (when: string) => `Last visit ${when}`,
  emptyTip: 'A tag after your link, ?ref=anything, tells trckable where the visitor came from. Share a different one in each place.',
  copy: 'Copy',
  copied: 'Link copied',
  copyLabel: 'Copy the sample link',
  nothingYet: 'No tagged visits in this period',
})
