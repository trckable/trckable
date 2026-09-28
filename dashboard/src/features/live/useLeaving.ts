import { useEffect, useState } from 'react'
import { reducedMotion } from '../../lib/motion'

/** How long a row takes to fade out and fold away (Live.css, .live-row.leaving). */
export const LEAVE_MS = 600

/**
 * A list whose removed items stay a moment, marked leaving, so they can fade
 * out instead of vanishing. With reduced motion they go at once.
 */
export function useLeaving<T extends { key: string }>(items: T[]): (T & { leaving?: boolean })[] {
  const [gone, setGone] = useState<(T & { index: number })[]>([])
  const [prev, setPrev] = useState(items)
  // Worked out while rendering (React's "adjust state on a prop change"),
  // so a leaving row never flickers out for a frame.
  if (prev !== items) {
    setPrev(items)
    if (!reducedMotion()) {
      const keep = new Set(items.map((i) => i.key))
      const left = prev.flatMap((p, index) => (keep.has(p.key) ? [] : [{ ...p, index }]))
      if (left.length) setGone((g) => [...g.filter((x) => !keep.has(x.key) && !left.some((l) => l.key === x.key)), ...left])
    }
  }
  // Once they have faded, they go. (A later leaver restarts the wait, which
  // only keeps an already invisible row a moment longer.)
  useEffect(() => {
    if (!gone.length) return
    const leaving = new Set(gone.map((g) => g.key))
    const t = setTimeout(() => setGone((g) => g.filter((x) => !leaving.has(x.key))), LEAVE_MS)
    return () => clearTimeout(t)
  }, [gone])

  if (!gone.length) return items
  const out: (T & { leaving?: boolean })[] = [...items]
  for (const g of gone) {
    if (items.some((i) => i.key === g.key)) continue
    out.splice(Math.min(g.index, out.length), 0, { ...g, leaving: true })
  }
  return out
}
