// The cards never reorder while you read: the order the page opened with is kept, and what arrives later waits behind
// a pill ("2 new") until it is asked for. Pure part: cardLock.test.ts.
import { useState } from 'react'
import type { Story } from './cards'

/** A card's place in the order: its topic, and which of that topic's cards it is. */
export const idOf = (list: Story[]): string[] => {
  const seen: Record<string, number> = {}
  return list.map((s) => `${s.key}#${(seen[s.key] = (seen[s.key] ?? -1) + 1)}`)
}

/** The cards in the order they were first read in, and those that have come since, in their own order. */
export function locked(stories: Story[], order: string[]): { known: Story[]; queued: Story[] } {
  const ids = idOf(stories)
  const at = (i: number) => {
    const k = order.indexOf(ids[i])
    return k < 0 ? Infinity : k
  }
  const idx = stories.map((_, i) => i)
  const known = idx.filter((i) => at(i) < Infinity).sort((a, b) => at(a) - at(b))
  return { known: known.map((i) => stories[i]), queued: idx.filter((i) => at(i) === Infinity).map((i) => stories[i]) }
}

export function useCardLock(sig: string, stories: Story[]) {
  const [lock, setLock] = useState<{ sig: string; order: string[] } | null>(null)
  const kept = lock && lock.sig === sig && lock.order.length ? lock : null
  // The order is taken the first time the page has cards for this period, and again when it is asked for.
  if (!kept && stories.length) setLock({ sig, order: idOf(stories) })
  const { known, queued } = locked(stories, kept?.order ?? idOf(stories))
  return { known, queued, release: () => setLock(null) }
}
