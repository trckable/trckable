// What the server says the same weekday brought, for the people who match some filters: a band to tell a number by.
import { call, rangeQS, type Filter } from '../../lib/api'
import type { Usual } from './model'
import { bandFromWeeks, type Band } from './usual'

const cache = new Map<string, Promise<Band | null>>()

/** What the server says the same weekday brought for the people who match the filters, as a band; null when it has too few weeks to say. */
export function usualBand(site: string, day: string, fs: Filter[]): Promise<Band | null> {
  const key = `${site}|${day}|${fs.map((f) => `${f.dim}${f.op ?? '='}${f.value}`).join('&')}`
  let p = cache.get(key)
  if (!p) {
    p = call<Usual>('GET', `/sites/${encodeURIComponent(site)}/usual` + rangeQS({ from: day, to: day, filters: fs }), undefined, undefined, true).then(
      (u) => bandFromWeeks((u.weeks ?? []).map((w) => w.visitors)),
      () => null,
    )
    cache.set(key, p)
    setTimeout(() => cache.delete(key), 60_000)
  }
  return p
}
