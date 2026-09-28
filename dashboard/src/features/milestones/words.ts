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
