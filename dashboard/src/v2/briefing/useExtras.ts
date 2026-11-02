// A saved funnel as the page tells it: its steps in this period and in the one before, and where the most are lost.
import { goalName } from '../../lib/goalName'
import { more } from '../../lib/apiMore'
import { addDays, type Range } from '../../lib/dates'
import type { FunnelStep, PaidStep } from '../../lib/api'
import { leakOf } from '../explore/data/mapSections'
import { copy } from './copy'

export interface FunnelStory {
  /** The saved funnel's name. */
  name?: string
  steps: { name: string; v: number; c: number }[]
  leak: { at: number; r: number; ur: number }
  /** The page many go to instead of the next step. */
  alt?: string
}

// A read kept for a minute by its key: the page's other numbers may be asked again (a report lands, a filter is set), the same read is not. A failed read is not kept.
function heldFor<T>(): (key: string, read: () => Promise<T>) => Promise<T> {
  const held = new Map<string, { at: number; v: Promise<T> }>()
  return (key, read) => {
    const k = held.get(key)
    if (k && Date.now() - k.at < 60_000) return k.v
    const v = read()
    held.set(key, { at: Date.now(), v })
    v.catch(() => held.delete(key))
    return v
  }
}

// The funnels the site saved.
const heldFunnels = heldFor<Awaited<ReturnType<typeof more.funnels>>>()
export const savedFunnelsOf = (site: string) => heldFunnels(site, () => more.funnels(site))

/** The path's steps in this period and in the one before it, and the first step where fewer go on than usual. */
export function readFunnel(site: string, range: Range, days: number, want: { steps: (FunnelStep | PaidStep)[]; alt?: string; name?: string }): Promise<FunnelStory | null> {
  const before: Range = { from: addDays(range.from, -days), to: addDays(range.from, -1) }
  return Promise.all([more.funnel(site, range, want.steps), more.funnel(site, before, want.steps).catch(() => null)]).then(
    ([c, p]) => {
      const steps = c.steps.map((s, i) => ({ name: s.kind === 'paid' && i > 0 ? copy.paidStep(stepName(c.steps[i - 1], '')) : stepName(s, copy.paidStep('')), v: s.visitors, c: p?.steps[i]?.visitors ?? 0 }))
      return { name: want.name, steps, leak: leakOf(steps), alt: want.alt }
    },
    () => null,
  )
}

/** A funnel step as it is read: Paid in words, a goal by its label or humanized event name, a page by its path. */
function stepName(s: { kind: string; label?: string; value: string }, paid: string): string {
  if (s.kind === 'paid') return paid
  return s.kind === 'goal' ? goalName(s.label, s.value) : s.label || s.value
}
