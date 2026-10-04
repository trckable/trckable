// A pin as a card tells it: the one figure (counted up when it is a number), its
// unit, the small chips beside it, when it happened and what the action says.
// Every figure is the server's own, as words.ts has it. Pure: figure.test.ts.
import { diffDays, fmtDay, type ISODate } from '../../lib/dates'
import { fmtInt, fmtPct } from '../../lib/format'
import { times } from '../../lib/times'
import { say as milestone } from '../milestones/words'
import { copy } from './copy'
import type { Pin } from './pins'

export interface Figure {
  /** A number to count up to; absent when the figure is words. */
  n?: number
  /** How a count is written on its way up (money, a plain count). */
  fmt?: (n: number) => string
  /** The figure when it is words, or the number's own text. */
  text?: string
  unit?: string
  /** A small figure in the card's tint beside it ("17.2×", "+50%"). */
  mult?: string
}

const signed = (x: number) => (x >= 0 ? '+' : '−') + fmtPct(Math.abs(x))

/** `money` writes an amount in the site's currency. */
export function figureOf(pin: Pin, money: (minor: number) => string): Figure {
  const { n } = pin
  switch (pin.kind) {
    case 'spike':
      // No usual to multiply (a quiet or young site): the count and the source, no multiplier.
      if (!n.factor) return { n: n.visitors ?? 0, fmt: fmtInt, unit: copy.unit.visitors }
      return n.visitors ? { n: n.visitors, fmt: fmtInt, unit: copy.unit.visitors, mult: times(n.factor) } : { text: times(n.factor) }
    case 'surge':
      return n.visitors ? { n: n.visitors, fmt: fmtInt, unit: copy.unit.online, mult: n.factor ? times(n.factor) : undefined } : { text: n.factor ? times(n.factor) : '' }
    case 'sale':
      return { n: n.amount ?? 0, fmt: (v) => money(Math.round(v)), text: money(n.amount ?? 0) }
    case 'referrer':
      return { n: n.visitors ?? 0, fmt: fmtInt, unit: copy.unit.visitors }
    case 'drop':
      return { text: `${fmtPct(n.wasRate ?? 0)} → ${fmtPct(n.rate ?? 0)}`, unit: copy.unit.buying }
    case 'milestone': {
      const s = milestone({ kind: n.family ?? 'visitors', value: n.value ?? 0, currency: n.currency })
      return s.n ? { n: s.n, fmt: (v) => milestone({ kind: n.family ?? 'visitors', value: Math.round(v), currency: n.currency }).big, text: s.big, unit: s.label } : { text: s.label }
    }
    case 'ai':
      return { text: n.name ?? '' }
    case 'move':
      return { text: signed(n.change ?? 0), unit: copy.unit.visitors }
    case 'pays':
      return { text: money(Math.round(n.perVisitor ?? 0)), unit: copy.unit.eachVisitor }
  }
}

/** When it happened, in words and as a date for a tooltip: "yesterday", "Sat, Sep 28". Nothing for a finding about the whole period. */
export function whenOf(pin: Pin, today: ISODate): { text: string; title: string } | undefined {
  if (!pin.day) return undefined
  const ago = diffDays(pin.day, today)
  const title = fmtDay(pin.day, { weekday: true })
  if (ago <= 0) return { text: copy.ago.today, title }
  if (ago === 1) return { text: copy.ago.yesterday, title }
  return { text: copy.ago.days(ago), title }
}

/** The action's two words: the day it shows, or what it filters. */
export function seeLabel(pin: Pin): string {
  if (pin.showDay && pin.day) return copy.show(fmtDay(pin.day))
  const dim = pin.filters[0]?.dim
  if (dim === 'entry_page') return copy.filterPage
  if (dim === 'channel' && pin.filters[0]?.value === 'AI') return copy.filterAi
  return copy.filterSource
}

/** What the toast says after the click: the filter and the day now on screen. */
export function showing(pin: Pin): string {
  const filter = pin.filters[0]?.value ?? ''
  const day = pin.day ? fmtDay(pin.day) : ''
  return copy.showing([filter, day].filter(Boolean).join(' · '))
}
