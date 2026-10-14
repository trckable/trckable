// What the card says about a mention, as plain values. Pure: model.test.ts.
import { tag } from '../../i18n'
import { fmtMove, relativeAgo } from '../../lib/format'
import { copy } from './copy'
import type { Mention, Source } from './api'

/** "Hacker News, Product Hunt and News & blogs": the places the server searches. */
export function placesOf(sources: Source[]): string {
  const names = sources.map((s) => copy.name[s])
  if (names.length < 2) return names.join('')
  try {
    return new Intl.ListFormat(tag ?? 'en', { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

/** The line under a title: who wrote it, how it did, and when. */
export function factsOf(m: Mention, now?: number): string[] {
  const out: string[] = []
  if (m.kind === 'comment') out.push(copy.comment)
  if (m.front) out.push(copy.front)
  if (m.author) out.push(copy.by(m.author))
  if (m.points && m.source !== 'news') out.push(copy.points[m.source](m.points))
  out.push(relativeAgo(m.posted_at, now))
  return out
}

/** The address a link may point to: a web address, nothing else. */
export const safeURL = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined)

/** The most mentions the card shows before "Show more". */
export const SHOWN = 5

/** "340%" for a jump of 4.4 times the usual. */
export const jumpOf = (factor: number) => `${fmtMove(factor - 1)}%`
