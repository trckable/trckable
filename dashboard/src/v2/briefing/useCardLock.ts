// The cards never reorder while you read: the order the page opened with is kept, and what arrives later waits behind
// a pill ("2 new") until it is asked for. Pure part: cardLock.test.ts.
import { useEffect, useState } from 'react'
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

/** How long the cards must stay as they are before the order is kept: what the page reads arrives a piece at a time. */
const SETTLE_MS = 1200

export function useCardLock(sig: string, stories: Story[]) {
  const [lock, setLock] = useState<{ sig: string; order: string[] } | null>(null)
  const kept = lock && lock.sig === sig ? lock : null
  const ids = idOf(stories)
  const said = ids.join('|')
  // The order is taken once the cards have stopped coming, and again when it is asked for.
  useEffect(() => {
    if (kept || !said) return
    const t = setTimeout(() => setLock({ sig, order: said.split('|') }), SETTLE_MS)
    return () => clearTimeout(t)
  }, [kept, said, sig])
  const { known, queued } = kept ? locked(stories, kept.order) : { known: stories, queued: [] }
  return { known, queued, release: () => setLock(null) }
}
