// How a milestone reads: the big part, what it is, and whether it is money.
// Pure, so the moment, the timeline and the tests share it.
import type { Milestone, MilestoneKind, MilestoneNext } from '../../lib/api'
import { fmtInt, fmtMoney } from '../../lib/format'
import { copy } from './copy'

export const isMoney = (kind: MilestoneKind) => kind === 'revenue' || kind === 'first_sale'

/** One-off milestones have no number: "First sale", not "1 sale". */
const ONCE = new Set<MilestoneKind>(['first_goal', 'first_sale'])

export interface Said {
  /** The number (or "1st"); empty for a one-off. */
  big: string
  /** The number itself, for a count-up; 0 for none. */
  n: number
  label: string
  money: boolean
}

/** The value as the family writes it: 10,000, or $1,000 for revenue. */
export function value(kind: MilestoneKind, n: number, currency?: string): string {
  if (kind === 'revenue' && currency) return fmtMoney(n, currency, 0)
  return fmtInt(n)
}

export function say(m: Pick<Milestone, 'kind' | 'value' | 'currency'>): Said {
  const money = isMoney(m.kind)
  if (ONCE.has(m.kind)) return { big: '', n: 0, label: copy.label[m.kind], money }
  if (m.kind === 'pageviews' && m.value === 1) return { big: '', n: 0, label: copy.label.firstPageview, money }
  return { big: value(m.kind, m.value, m.currency), n: m.value, label: copy.label[m.kind], money }
}

/** The faint row for what comes next: "next 10,000 visitors · 7,412 now". */
export function nextLine(n: MilestoneNext): string {
  return copy.next(value(n.kind, n.step, n.currency), copy.label[n.kind], value(n.kind, Math.floor(n.now), n.currency))
}

/** A timeline, newest first, grouped by year. */
export function byYear(list: Milestone[]): { year: string; items: Milestone[] }[] {
  const out: { year: string; items: Milestone[] }[] = []
  for (const m of list) {
    const y = m.day.slice(0, 4)
    const last = out[out.length - 1]
    if (last && last.year === y) last.items.push(m)
    else out.push({ year: y, items: [m] })
  }
  return out
}

/** The key the server knows a milestone by. */
export const keyOf = (m: Pick<Milestone, 'kind' | 'step'>): [string, string] => [m.kind, m.step]

/** Whether the menu shows a dot: something stored since the timeline was
 *  last opened, other than the moment on screen. */
export function hasDot(list: Milestone[], openedAt: number, moment: Milestone | null): boolean {
  return list.some((m) => m.created_at > openedAt && !(moment && m.kind === moment.kind && m.step === moment.step))
}

/** The newest reached milestone: the latest day, then the latest stored. */
export function newest(list: Milestone[]): Milestone | null {
  let best: Milestone | null = null
  for (const m of list) if (!best || m.day > best.day || (m.day === best.day && m.created_at > best.created_at)) best = m
  return best
}

/** Revenue shows its number wherever the report shows revenue to this person
 *  (`revenue`); "Show amount" only governs the share card and link. */
export const showsBig = (m: Pick<Milestone, 'kind'>, revenue: boolean) => m.kind !== 'revenue' || revenue

/** What sits in the badge: the number, "1st" for a one-off, nothing for hidden money. */
export function badge(m: Milestone, revenue: boolean): string {
  const w = say(m)
  if (!w.big) return copy.first
  return showsBig(m, revenue) ? w.big : ''
}

/** The one sentence under the number. */
export function lineOf(m: Milestone, revenue: boolean): string {
  const L = copy.line
  const w = say(m)
  if (m.kind === 'first_goal' || m.kind === 'first_sale') return L[m.kind]
  if (!w.big) return L.firstPageview
  if (m.kind === 'revenue') return showsBig(m, revenue) ? L.revenue(w.big) : L.revenueQuiet
  if (m.kind === 'visitors' || m.kind === 'pageviews' || m.kind === 'record_day' || m.kind === 'countries') return L[m.kind](w.big)
  return ''
}

/** How far a family is to its next step, whole percent, never 100 before it is reached. */
export function ringPct(n: Pick<MilestoneNext, 'step' | 'now'>): number {
  if (n.step <= 0 || n.now <= 0) return 0
  return Math.min(99, Math.floor((n.now / n.step) * 100))
}

/** What is left: "547 to go", or "no sale yet" for revenue at zero. */
export function leftLine(n: MilestoneNext): string {
  if (n.kind === 'revenue' && n.now <= 0) return copy.noSaleYet
  return copy.toGo(value(n.kind, Math.max(0, Math.ceil(n.step - n.now)), n.currency))
}

/** The goal as a tile names it: "1,000 visitors". */
export const goalLine = (n: MilestoneNext) => `${value(n.kind, n.step, n.currency)} ${copy.label[n.kind]}`

/** The next step nearest to done. */
export function nearest(list: MilestoneNext[]): MilestoneNext | null {
  let best: MilestoneNext | null = null
  for (const n of list) if (!best || n.now / n.step > best.now / best.step) best = n
  return best
}

/** A reached tile's name: "10 countries", "First sale"; hidden money stays unnamed. */
export function tileLabel(m: Milestone, revenue: boolean): string {
  const w = say(m)
  if (!w.big) return w.label
  return showsBig(m, revenue) ? `${w.big} ${w.label}` : copy.revenueQuiet
}
