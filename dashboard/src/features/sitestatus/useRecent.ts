// The last day of visits, for the card's chart and its last-visit tile: one
// read of the newest events, counted by the hour up to now.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export const HOURS = 24

export interface Recent {
  /** Visits per hour, oldest first, the last slot being this hour. */
  slices: number[]
  /** The page of the newest visit. */
  path?: string
  /** Unix seconds when it was read. */
  now: number
}

export function slicesOf(times: number[], now: number): number[] {
  const out = new Array<number>(HOURS).fill(0)
  for (const t of times) {
    const ago = Math.floor((now - t) / 3600)
    if (ago >= 0 && ago < HOURS) out[HOURS - 1 - ago]++
  }
  return out
}

/** The slot of a moment among the slices. */
export const slotOf = (t: number, now: number) => Math.max(0, HOURS - 1 - Math.floor((now - t) / 3600))

export function useRecent(site: string): Recent | null {
  const [recent, setRecent] = useState<Recent | null>(null)
  useEffect(() => {
    let current = true
    api
      .events(site, 200)
      .then((r) => {
        const now = Date.now() / 1000
        if (current) setRecent({ slices: slicesOf(r.events.map((e) => Date.parse(e.ts) / 1000), now), path: r.events[0]?.path, now })
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [site])
  return recent
}
