// What the chart and Explore share about a period: its kind, what the server calls usual, a multiple written the way the
// walkthrough does, and a host as people say it. Pure: model.test.ts.
import { fmtFixed } from '../../lib/format'
import { MAX_TIMES } from '../../lib/thin'
import { KNOWN } from '../../features/markers/sources'

export type Unit = 'today' | 'yesterday' | 'week' | 'month' | 'range'

/** The kind of period a preset (or a custom range) is: it chooses the words. */
export function unitOf(period: string): Unit {
  if (period === 'today' || period === 'now') return 'today'
  if (period === 'yesterday') return 'yesterday'
  if (['7d', '14d', 'wtd', 'lastweek'].includes(period)) return 'week'
  if (['28d', '30d', 'mtd', 'lastmonth'].includes(period)) return 'month'
  return 'range'
}

/** What the server calls usual for the day: today's visitors, the average of the same weekday up to the same time, and the weeks behind it. */
export interface Usual {
  visitors: number
  average: number
  weeks: { day: string; visitors: number }[] | null
}

/** "21×", "2.4×": the multiple with one decimal under ten, whole above, and never a huge number. */
export function mult(r: number): string {
  const cap = Math.min(r, MAX_TIMES * 10)
  const x = cap >= 10 ? Math.round(cap) : Math.round(cap * 10) / 10
  return `${Number.isInteger(x) ? String(x) : fmtFixed(x, 1)}×`
}

const host = (v: string) => v.replace(/^www\./, '')

/** A host as people say it: "Hacker News" for news.ycombinator.com, the host itself when it is not a known place. */
export function sourceName(value: string): string {
  const h = host(value)
  const is = (k: { hosts: string[] }) => k.hosts.some((x) => h === x || h.endsWith('.' + x))
  return KNOWN.find(is)?.name ?? PLACES.find(is)?.name ?? h
}

/** More places people know by name, under any of their subdomains (lm.facebook.com is Facebook). Proper nouns, the same in every language. */
const PLACES = [
  { name: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  { name: 'Instagram', hosts: ['instagram.com'] },
  { name: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  { name: 'Pinterest', hosts: ['pinterest.com'] },
  { name: 'TikTok', hosts: ['tiktok.com'] },
  { name: 'WhatsApp', hosts: ['whatsapp.com', 'wa.me'] },
  { name: 'Yahoo', hosts: ['yahoo.com'] },
  { name: 'DuckDuckGo', hosts: ['duckduckgo.com'] },
  { name: 'Yandex', hosts: ['yandex.com', 'yandex.ru'] },
  { name: 'Baidu', hosts: ['baidu.com'] },
]
