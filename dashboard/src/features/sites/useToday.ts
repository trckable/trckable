// Today's visitors and who is on now, per site, for the switcher's numbers.
// They come from the all-sites overview (its last day), asked for once when
// the list opens and kept for a short while; the list never waits for them,
// and shows no number until they are here.
import { useEffect, useState } from 'react'
import { api, type SiteRow } from '../../lib/api'

export interface Today {
  visitors: number
  online: number
}

const FRESH_MS = 30_000
let kept: { at: number; by: Map<string, Today> } | null = null

/** A row's today is the last day of its series; a row that could not be read has none. */
export function todayOf(rows: SiteRow[]): Map<string, Today> {
  const by = new Map<string, Today>()
  for (const r of rows) {
    const last = r.series?.[r.series.length - 1]
    if (!r.error && last !== undefined) by.set(r.id, { visitors: last, online: r.online })
  }
  return by
}

/** The totals over every site the numbers cover. */
export function totalOf(by: Map<string, Today>): Today {
  let visitors = 0
  let online = 0
  for (const t of by.values()) {
    visitors += t.visitors
    online += t.online
  }
  return { visitors, online }
}

const fresh = () => (kept && Date.now() - kept.at < FRESH_MS ? kept.by : null)

/** Null until the numbers are here (or for good, if they cannot be read). */
export function useToday(): Map<string, Today> | null {
  const [by, setBy] = useState(fresh)
  useEffect(() => {
    if (fresh()) return
    const ac = new AbortController()
    api
      .overview(7, ac.signal)
      .then((r) => {
        kept = { at: Date.now(), by: todayOf(r.sites) }
        setBy(kept.by)
      })
      .catch(() => {}) // no numbers is a list without them, not a broken one
    return () => ac.abort()
  }, [])
  return by
}
