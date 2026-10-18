// What the lists say about a mention, as plain values. Pure: model.test.ts.
import { tag } from '../../i18n'
import { copy } from './copy'
import type { Mention, Source } from './api'
import { dateFmt } from '../../lib/format'

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

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

/** When a mention was posted, as the language says it: "3 hours ago". */
export function agoOf(unix: number, now = Date.now() / 1000): string {
  const s = Math.max(0, now - unix)
  const rtf = new Intl.RelativeTimeFormat(tag ?? 'en', { numeric: 'auto' })
  for (const [unit, size] of UNITS) if (s >= size) return rtf.format(-Math.floor(s / size), unit)
  return rtf.format(0, 'minute')
}

/** The line under a title: who wrote it, how it did, and when. */
export function factsOf(m: Mention, now?: number): string[] {
  const out: string[] = []
  if (m.kind === 'comment') out.push(copy.comment)
  if (m.front) out.push(copy.front)
  if (m.author) out.push(copy.by(m.author))
  if (m.points && (m.source === 'hn' || m.source === 'ph')) out.push(copy.points[m.source](m.points))
  out.push(agoOf(m.posted_at, now))
  return out
}

/** The address a link may point to: a web address, nothing else. */
export const safeURL = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined)

/** "340%" for a jump of 4.4 times the usual. */
export const jumpOf = (factor: number) => `${Math.round((factor - 1) * 100)}%`

/** A short date for a mention's row: "Oct 14". */
export const dateOf = (unix: number) => dateFmt(tag ?? 'en', { month: 'short', day: 'numeric' }).format(new Date(unix * 1000))
