// What a pin says: the one line (hover and screen readers), and the card's
// title, big figure and facts. Every figure is the server's own; the lines the
// Highlights and Replay already write are used as they are. Pure: words.test.ts.
import type { Pin } from './pins'
import { extrasCopy } from '../extras/copy'
import { copy as story } from '../story/copy'
import { say as milestone } from '../milestones/words'
import { fmtDay } from '../../lib/dates'
import { fmtInt, fmtPct } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { copy } from './copy'

export interface Said {
  title: string
  /** One line: the hover card, and what a screen reader reads. */
  line: string
  big: string
  facts: string[]
}

const when = (day?: string) => (day ? fmtDay(day, { weekday: true }) : '')
const times = (f: number) => f.toFixed(1)
const signed = (x: number) => (x >= 0 ? '+' : '−') + fmtPct(Math.abs(x))

/** `money` writes an amount in the site's currency. */
export function say(pin: Pin, money: (minor: number) => string): Said {
  const { n } = pin
  const title = copy.title[pin.kind]
  const name = pin.filters[0]?.dim === 'channel' ? channelLabel(n.name ?? '') : (n.name ?? '')
  switch (pin.kind) {
    case 'spike': {
      const line = [extrasCopy.ring.spike(n.factor ?? 3), n.referrer ? extrasCopy.ring.from(n.referrer) : ''].filter(Boolean).join(' · ')
      return { title, line, big: n.visitors ? copy.visitors(n.visitors) : `${times(n.factor ?? 3)}×`, facts: [copy.usual(times(n.factor ?? 3)), n.referrer ? extrasCopy.ring.from(n.referrer) : '', when(pin.day)].filter(Boolean) }
    }
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
    case 'move':
      return { title, line: extrasCopy.highlights.moved(name, n.change ?? 0, n.visitors ?? 0, n.was ?? 0), big: signed(n.change ?? 0), facts: [name, `${fmtInt(n.was ?? 0)} → ${copy.visitors(n.visitors ?? 0)}`] }
    case 'pays':
      return { title, line: extrasCopy.highlights.pays(name, money(Math.round(n.perVisitor ?? 0)), n.times ?? 0), big: copy.perVisitor(money(Math.round(n.perVisitor ?? 0))), facts: [name, copy.average(times(n.times ?? 0))] }
  }
}
