// How a card is dressed: every card of the Briefing is the one shell, and this says what goes in its slots. The subject
// and the badge in the top row, the picture that fills the lower part and the plain link in the footer, each from the
// card's own data. Pure: cardShape.test.ts.
import { copy } from './copy'
import { copy as cardCopy } from './cards.copy'
import { mult } from './model'
import type { Story, Topic, Vis } from './cards'

/** The picture of a card: a rising line, the usual's band with the number on it, the sales, rows, the signup steps or the outage's day. */
export type Pic = 'spike' | 'band' | 'goals' | 'money' | 'rows' | 'steps' | 'journey' | 'outage' | 'none'

export interface Badge {
  text: string
  tone: 'up' | 'dn'
}

export interface Shape {
  /** What the card is about, in the top row beside its icon. */
  subject: string
  badge: Badge | null
  pic: Pic
  /** The plain link in the footer, which goes deeper; none where the card's own action is the way in. */
  link: string | null
  /** Whether the line of why shows: not on a card of several goals, whose rows already say each number and usual. */
  why: boolean
}

const PIC: Record<Vis['k'], Pic> = { spike: 'spike', journey: 'journey', ba: 'band', goals: 'goals', funnel: 'steps', outage: 'outage', rcpt: 'rows' }

/** A rise of less than this, either way, is not worth a badge. */
const QUIET = 0.05

/** "↑ 19× usual" from 1.5 times, the percent either side of it, and nothing for a number at its usual. */
export function usualBadge(ratio: number): Badge | null {
  if (ratio >= 1.5) return { text: cardCopy.timesUsual(mult(ratio)), tone: 'up' }
  const pct = Math.round(Math.abs(ratio - 1) * 100)
  if (Math.abs(ratio - 1) < QUIET || pct < 1) return null
  return ratio > 1 ? { text: cardCopy.pctAbove(pct), tone: 'up' } : { text: cardCopy.pctBelow(pct), tone: 'dn' }
}

function badgeOf(s: Story): Badge | null {
  if (s.mark) return { text: s.mark, tone: 'up' }
  if (s.ratio !== undefined) return usualBadge(s.ratio)
  // The sales say their number big in the card; every other card without a usual says its figure in the corner.
  if (s.key === 'sales' || !s.val) return null
  return { text: s.val, tone: s.bad && !s.calm ? 'dn' : 'up' }
}

const LINK: Partial<Record<Topic, string>> = { countries: cardCopy.linkWho, sources: cardCopy.linkWho, devices: cardCopy.linkWho, pages: cardCopy.linkWho, goals: cardCopy.linkDrove, sales: cardCopy.linkCame }

function picOf(s: Story): Pic {
  if (!s.vis) return 'none'
  return s.key === 'sales' && s.vis.k === 'rcpt' ? 'money' : PIC[s.vis.k]
}

export function shapeOf(s: Story): Shape {
  return {
    subject: s.kc ? `${s.kc.flag} ${s.kc.label}` : copy.detailTitle[s.key],
    badge: badgeOf(s),
    pic: picOf(s),
    link: s.key === 'uptime' ? null : (LINK[s.key] ?? copy.deeper),
    why: !(s.vis?.k === 'goals' && s.vis.rows.length > 1),
  }
}

const FLAGS = /[\u{1F1E6}-\u{1F1FF}]{2}\s*/gu
const FIGURE = /[$€£]?\d+(?:[.,]\d+)*[%×]?/

/** The sentence of a card, flag taken out where the top row has it, split around the one figure that is lit: the card's own number where it is in the words, else the first. */
export function sentence(s: Story): { before: string; figure: string; after: string } {
  const text = `${s.head}${s.rest ?? ''}`.replace(FLAGS, '').trim()
  // The sales say their figure big in the picture: no second one is lit in the words.
  if (s.key === 'sales' && s.vis?.k === 'rcpt') return { before: text, figure: '', after: '' }
  const own = s.val ? new RegExp(`(?<![\\d.,])${s.val.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&')}(?![\\d])`).exec(text) : null
  const m = own ?? FIGURE.exec(text)
  if (!m) return { before: text, figure: '', after: '' }
  return { before: text.slice(0, m.index), figure: m[0], after: text.slice(m.index + m[0].length) }
}
