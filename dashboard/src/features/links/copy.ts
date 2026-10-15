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
  // The Which link worked? card on the story.
  question: 'Which link worked?',
  statusSignups: 'sign-ups',
  statusVisitors: 'visitors',
  pill: (rate: string, times?: number) => (times ? `${rate} · ${times}× usual` : rate),
  visitorsN: (n: number) => (n === 1 ? '1 visitor' : `${n} visitors`),
  signupsN: (n: number) => (n === 1 ? '1 sign-up' : `${n} sign-ups`),
  and: (a: string, b: string) => `${a} and ${b}`,
  brought: (name: string, what: string) => `Your ${name} link brought ${what}.`,
  runnerNone: (name: string, visitors: number) => `${name} brought ${visitors}, none signed up.`,
  runnerSome: (name: string, visitors: number, signups: number) => `${name} brought ${visitors}, ${signups} signed up.`,
  runnerVisitors: (name: string, visitors: number) => `${name} brought ${visitors}.`,
  see: (name: string) => `See ${name}'s visitors`,
})
