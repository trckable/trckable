// What a pin says: the one line (hover and screen readers), and the card's
// title, big figure and facts. Every figure is the server's own; the lines the
// Highlights and Replay already write are used as they are. Pure: words.test.ts.
import type { Pin } from './pins'
import { extrasCopy } from '../extras/copy'
import { changeShown } from '../extras/highlightModel'
import { copy as story } from '../story/copy'
import { say as milestone } from '../milestones/words'
import { fmtDay } from '../../lib/dates'
import { fmtInt, fmtPct } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { times } from '../../lib/times'
import { copy, titleOf } from './copy'
import { extraOf, type Span } from './spans'
import { periodOf } from '../story/moments'

export interface Said {
  title: string
  /** One line: the hover card, and what a screen reader reads. */
  line: string
  big: string
  facts: string[]
}

const when = (day?: string) => (day ? fmtDay(day, { weekday: true }) : '')
const signed = (x: number) => (x >= 0 ? '+' : '−') + fmtPct(Math.abs(x))

/** `money` writes an amount in the site's currency. */
export function say(pin: Pin, money: (minor: number) => string): Said {
  const { n } = pin
  const title = titleOf(pin)
  const name = pin.filters[0]?.dim === 'channel' ? channelLabel(n.name ?? '') : (n.name ?? '')
  switch (pin.kind) {
    case 'spike': {
      const from = n.referrer ? extrasCopy.ring.from(n.referrer) : ''
      // Without a usual to multiply (a quiet or young site) it is new traffic: the count and the source.
      if (!n.factor) return { title, line: [extrasCopy.ring.newTraffic(n.visitors ?? 0), from].filter(Boolean).join(' · '), big: copy.visitors(n.visitors ?? 0), facts: [from, when(pin.day)].filter(Boolean) }
      return { title, line: [extrasCopy.ring.spike(n.factor), from].filter(Boolean).join(' · '), big: n.visitors ? copy.visitors(n.visitors) : times(n.factor), facts: [copy.usual(times(n.factor)), from, when(pin.day)].filter(Boolean) }
    }
    case 'surge':
      return { title, line: n.name ? copy.surgeFrom(n.name) : title, big: copy.visitors(n.visitors ?? 0), facts: [copy.usual(times(n.factor ?? 0)), when(pin.day)] }
    case 'sale': {
      const channel = n.channel ? copy.mostly(channelLabel(n.channel)) : ''
      return { title, line: [extrasCopy.ring.sales(n.count ?? 1, money(n.amount ?? 0)), channel].filter(Boolean).join(' · '), big: money(n.amount ?? 0), facts: [copy.sales(n.count ?? 1), channel, when(pin.day)].filter(Boolean) }
    }
    case 'referrer':
      return { title, line: extrasCopy.highlights.fresh(name, n.visitors ?? 0), big: name, facts: [copy.visitors(n.visitors ?? 0), pin.day ? copy.firstSeen(fmtDay(pin.day)) : ''].filter(Boolean) }
    case 'drop':
      return { title, line: extrasCopy.highlights.drop(name, n.wasRate ?? 0, n.rate ?? 0), big: `${fmtPct(n.wasRate ?? 0)} → ${fmtPct(n.rate ?? 0)}`, facts: [name, copy.visitors(n.visitors ?? 0), pin.day ? copy.since(fmtDay(pin.day)) : ''].filter(Boolean) }
    case 'milestone': {
      const s = milestone({ kind: n.family ?? 'visitors', value: n.value ?? 0, currency: n.currency })
      return { title, line: story.milestone([s.big, s.label].filter(Boolean).join(' ')), big: s.big || s.label, facts: [s.big ? s.label : '', when(pin.day)].filter(Boolean) }
    }
    case 'ai':
      return { title, line: story.ai(n.name ?? ''), big: n.name ?? '', facts: [copy.firstAi, when(pin.day)].filter(Boolean) }
    case 'move': {
      const by = changeShown(n.visitors ?? 0, n.was ?? 0)
      const big = { percent: signed(n.change ?? 0), capped: '10x+', bare: fmtInt(n.visitors ?? 0) }[by]
      return { title, line: extrasCopy.highlights.moved(name, n.change ?? 0, n.visitors ?? 0, n.was ?? 0, by), big, facts: [name, `${fmtInt(n.was ?? 0)} → ${copy.visitors(n.visitors ?? 0)}`] }
    }
    case 'pays':
      return { title, line: extrasCopy.highlights.pays(name, money(Math.round(n.perVisitor ?? 0)), n.times ?? 0), big: copy.perVisitor(money(Math.round(n.perVisitor ?? 0))), facts: [name, copy.average(times(n.times ?? 0))] }
  }
}

/** A source's name as a person says it: "google.com" and "www.google.com" are "Google". */
export function hostLabel(host: string): string {
  const first = host.replace(/^www\./, '').split('.')[0] ?? host
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/** What a moment on the chart is called, in plain words: from its kind and its cause. */
export function headline(s: Span): string {
  const m = s.main
  const who = m.n.referrer ?? (m.kind === 'referrer' ? m.n.name : undefined)
  if (s.dir === 'down') return m.kind === 'drop' ? copy.span.fewer : copy.span.quiet
  switch (m.kind) {
    case 'spike':
    case 'surge':
      return who ? copy.span.found(hostLabel(who)) : copy.span.busy
    case 'sale':
      return copy.span.sales
    case 'milestone':
      return copy.span.milestone
    case 'ai':
      return copy.span.ai
    case 'referrer':
      return who ? copy.span.fresh(hostLabel(who)) : copy.span.busy
    default:
      return copy.span.busy
  }
}

/** The days and, where the moment is about visitors, what they added: "Sep 27–29 · +7,800 visitors". */
export function spanLine(s: Span): string {
  const extra = extraOf(s)
  const days = periodOf([s.from, s.to])
  return extra ? `${days} · ${copy.span.more(fmtInt(extra))}` : days
}
