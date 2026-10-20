// The links read (server/internal/api/links.go): the tagged links of a period and what each brought.
import { call, rangeQS } from '../../lib/api'

export interface Link {
  /** The filter that finds this link's visits: a referrer (a ?ref tag and its site) or a utm_source. */
  dim: 'referrer' | 'source'
  value: string
  /** The link filter's value: finds every visit of this row, whichever way the tag was spelled. */
  key: string
  visitors: number
  /** Visitors who reached a goal. */
  goals: number
  /** Revenue credited to it, in minor units; absent while revenue is off. */
  revenue?: number
  /** Unix seconds of the latest visit in the period. */
  last: number
  /** Visitors per day over the 30 days up to the period's end. */
  spark: number[]
}

export interface LinksAnswer {
  links: Link[]
  /** The goals module is on: a count of 0 means none, not unknown. */
  goals: boolean
  currency?: string
  exponent?: number
}

// The links of a period are asked for by more than one part of the page (the chart's markers, the Which link
// worked? card): one read answers them all, and a period read a moment ago is not asked again.
const KEEP_MS = 30_000
const KEPT = 8
const kept = new Map<string, { at: number; p: Promise<LinksAnswer> }>()

/** The same answer, given up on (not the read) when the caller leaves. */
function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', stop, { once: true })
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

export const linksApi = {
  read: (site: string, from: string, to: string, signal?: AbortSignal): Promise<LinksAnswer> => {
    const key = `${site}:${from}:${to}`
    const hit = kept.get(key)
    if (hit && Date.now() - hit.at < KEEP_MS) return abortable(hit.p, signal)
    const p = call<LinksAnswer>('GET', `/sites/${encodeURIComponent(site)}/report/links` + rangeQS({ from, to }))
    kept.delete(key)
    kept.set(key, { at: Date.now(), p })
    if (kept.size > KEPT) kept.delete(kept.keys().next().value as string)
    p.catch(() => {
      if (kept.get(key)?.p === p) kept.delete(key) // a failed read is asked again next time
    })
    return abortable(p, signal)
  },
}
