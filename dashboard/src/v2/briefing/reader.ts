// "Meet one of them": one real visitor of the day, said in a line. From the visits the page already has (the live
// stream); nothing when there is no visitor to speak of. Pure: reader.test.ts.
import type { Visit } from '../../lib/api'
import { countryName } from '../../lib/format'
import { pageName } from '../../lib/pageName'
import { sourceName } from './model'

interface Reader {
  where: string
  /** The outside site that sent them, as people say it ("Hacker News"), when there was one. */
  via?: string
  pages: number
  last: string
}

const hostOf = (r: string) => r.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

/** The latest visitor who read more than one page, preferring one sent by `prefer` (a source host) when there is one. */
export function readerOf(visits: Visit[], self: string, prefer?: string): Reader | null {
  const byVisitor = new Map<string, Visit[]>()
  for (const v of visits) {
    if (v.kind !== 'pageview' || !v.visitor || !v.path) continue
    const list = byVisitor.get(v.visitor) ?? []
    list.push(v)
    byVisitor.set(v.visitor, list)
  }
  const all = [...byVisitor.values()].map((l) => l.sort((a, b) => a.ts - b.ts)).filter((l) => l.length > 1)
  if (!all.length) return null
  const from = (l: Visit[]) => hostOf(l.find((v) => v.referrer)?.referrer ?? '')
  const sent = (l: Visit[]) => (prefer ? hostOf(from(l)) === hostOf(prefer) : false)
  const pick = all.filter(sent).sort((a, b) => b[b.length - 1].ts - a[a.length - 1].ts)[0] ?? all.sort((a, b) => b[b.length - 1].ts - a[a.length - 1].ts)[0]
  const first = pick[0]
  const src = from(pick)
  return {
    where: first.city || (first.country ? countryName(first.country) : ''),
    via: src && src !== hostOf(self) ? sourceName(src) : undefined,
    pages: pick.length,
    last: pick[pick.length - 1].path ?? '/',
  }
}

/** The reader as a clause: "someone in Brooklyn, who found you through Hacker News, read 4 pages and finished on /pricing". */
export function readerWords(r: Reader): string {
  const where = r.where ? ` in ${r.where}` : ''
  const via = r.via ? `, who found you through ${r.via},` : ''
  return `someone${where}${via} read ${r.pages} pages and finished on ${pageName(r.last)}`
}
