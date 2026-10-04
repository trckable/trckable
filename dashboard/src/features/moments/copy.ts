// Every word of the moments on the chart and of the card on opening, apart
// from the lines the Highlights and Replay already say (they are reused, so a
// finding reads the same wherever it appears). What moves to the message files
// when translations come.
import { fmtInt } from '../../lib/format'
import type { Pin } from './pins'
import { defineCopy } from '../../i18n'

const sales = (n: number) => `${fmtInt(n)} ${n === 1 ? 'sale' : 'sales'}`

export const copy = defineCopy('moments', {
  title: {
    spike: 'Traffic spike',
    surge: 'Busy moment',
    newTraffic: 'New traffic',
    sale: 'Sales',
    referrer: 'New referrer',
    drop: 'Fewer buyers',
    milestone: 'Milestone',
    ai: 'AI assistant',
    move: 'Source moved',
    pays: 'Best payer',
  },
  // The figure's unit, when it happened and what the action says: the card is a deck of kinds.
  unit: { visitors: 'visitors', online: 'online', buying: 'buying', eachVisitor: 'a visitor' },
  ago: { today: 'today', yesterday: 'yesterday', days: (n: number) => `${n} days ago` },
  show: (day: string) => `Show ${day}`,
  filterSource: 'Filter source',
  filterPage: 'Filter page',
  filterAi: 'Filter AI',
  showing: (what: string) => `Showing ${what}`,
  clear: 'Clear',
  moments: 'Moments on the chart',
  marker: (day: string, line: string, more: number) => `${day}: ${line}${more ? `, and ${more} more` : ''}. Show it`,
  more: (n: number) => `+${n} more`,
  milestones: (n: number) => `${n} milestones`,
  close: 'Close',
  share: 'Share',
  visitors: (n: number) => `${fmtInt(n)} visitors`,
  sales,
  surgeFrom: (name?: string) => (name ? `Surge from ${name}` : 'Surge'),
  usual: (times: string) => `${times} the usual`,
  mostly: (channel: string) => `mostly ${channel}`,
  since: (day: string) => `since ${day}`,
  firstSeen: (day: string) => `first seen ${day}`,
  firstAi: 'First AI assistant visit',
  average: (times: string) => `${times} the average`,
  perVisitor: (each: string) => `${each} a visitor`,
  // The first-week cards (the weekly email's is the first screen's own).
  discover: {
    exclude: { label: 'Your visits', title: 'Exclude your own visits?', body: 'Your own clicks count as visitors.', go: 'Exclude this browser' },
    replay: { label: 'Replay', title: 'Replay this period', body: 'Your days, played as a story.', go: 'Play week' },
    full: { label: 'Full mode', title: 'See everything', body: 'Every card, not only the basics.', go: 'Open Full' },
    search: { label: 'Search Console', title: 'See what people search for', body: 'Google’s numbers, beside yours.', go: 'Connect' },
  },
  // The card on opening.
  today: {
    label: 'One thing today',
    sinceVisit: 'Since your last visit',
    thisWeek: 'This week',
    next: 'Next',
    see: 'See it',
    done: 'Done',
    of: (at: number, total: number) => `${at} of ${total}`,
    previous: 'Previous',
  },
})

/** A pin's name: a spike with no usual to multiply is new traffic. */
export const titleOf = (pin: Pin) => (pin.kind === 'spike' && !pin.n.factor ? copy.title.newTraffic : copy.title[pin.kind])
