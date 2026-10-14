// What the Mentions page shows, as plain values. Pure: pageModel.test.ts.
import type { Mention, Source } from './api'

export type Filter = 'all' | Source

export const FILTERS: Filter[] = ['all', 'hn', 'ph', 'news']

/** A mention younger than this is "talked about now". */
export const FRESH = 24 * 3600

export const filterOf = (list: Mention[], f: Filter): Mention[] => (f === 'all' ? list : list.filter((m) => m.source === f))

/** What the top of the page tells: the one being talked about now, or the calm summary. */
export type Hero = { kind: 'now'; m: Mention } | { kind: 'calm'; count: number; visitors: number; best: Mention } | null

export function heroOf(list: Mention[], driving: Mention | null, now = Date.now() / 1000): Hero {
  const fresh = list.filter((m) => now - m.posted_at < FRESH)
  const pick = driving ?? [...fresh].sort((a, b) => b.visitors - a.visitors || b.posted_at - a.posted_at)[0]
  if (pick) return { kind: 'now', m: pick }
  if (!list.length) return null
  const best = [...list].sort((a, b) => b.visitors - a.visitors || b.posted_at - a.posted_at)[0]
  return { kind: 'calm', count: list.length, visitors: list.reduce((n, m) => n + m.visitors, 0), best }
}

/** Is a mention still sending people in the last hours of its curve? */
export const stillComing = (curve: number[] | undefined, m: Mention) => !!m.driving || (!!curve && curve.slice(-3).some((n) => n > 0) && curve.length < 49)

export interface Part {
  text: string
  hit: boolean
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A sentence cut at the words searched for, so the match can be marked. At most 280 characters, centred on the first match. */
export function quoteParts(text: string, words: string[], max = 280): Part[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  const ws = words.map((w) => w.trim()).filter((w) => w.length > 2)
  const re = ws.length ? new RegExp(`(${ws.map(escape).join('|')})`, 'gi') : null
  let body = clean
  if (clean.length > max) {
    const at = re ? clean.search(re) : -1
    const from = at > max / 2 ? at - Math.floor(max / 4) : 0
    body = (from > 0 ? '…' : '') + clean.slice(from, from + max).trimEnd() + (from + max < clean.length ? '…' : '')
  }
  if (!re) return [{ text: body, hit: false }]
  return body
    .split(re)
    .filter(Boolean)
    .map((t) => ({ text: t, hit: ws.some((w) => w.toLowerCase() === t.toLowerCase()) }))
}

/** A line through the values, in a box: "x,y x,y" for an SVG polyline. Flat zeros sit on the floor. */
export function sparkPoints(values: number[], w: number, h: number, pad = 2, ceil = 0): string {
  if (values.length < 2) return ''
  const top = Math.max(1, ceil, ...values)
  const step = (w - pad * 2) / (values.length - 1)
  return values.map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - (v / top) * (h - pad * 2)).toFixed(1)}`).join(' ')
}

/** The same line closed along the floor, for a soft fill. */
export function areaPoints(values: number[], w: number, h: number, pad = 2, ceil = 0): string {
  const line = sparkPoints(values, w, h, pad, ceil)
  return line ? `${pad},${h - pad} ${line} ${w - pad},${h - pad}` : ''
}

/** The mention to open for an address's ?m=, or null. */
export const openedOf = (list: Mention[], search: string): Mention | null => {
  const id = Number(new URLSearchParams(search).get('m'))
  return list.find((m) => m.id === id) ?? null
}

/** The host a link points to without "www.", for the outlet line of a news item. */
export const outletOf = (m: Mention) => m.host.replace(/^www\./, '')

/** The page of a Hacker News item, where a reply goes; nothing for other sources. */
export const replyURL = (m: Mention) => (m.source === 'hn' && /^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/.test(m.url) ? m.url : undefined)
