// The post written from what was picked: the card's own facts (the numbers and words the server's card says, never
// recalculated) in a template per card, shaped for the network. X, Threads and Bluesky get a line or two with the
// strongest number first, LinkedIn and Facebook a short post with a closing line, the rest a caption like it. The link
// is not in the text: X counts it beside it, the others take it from the network's own share.
import { X_LINK, X_MAX, chars } from './post'
import { postCopy as t } from './postCopy'
import type { Place } from './places'
import type { Facts } from './card'

export type PostShape = 'short' | 'long'
/** X, Threads and Bluesky take a short text; every other place a longer one. */
export const shapeOfPlace = (place: Place): PostShape => (['x', 'threads', 'bluesky'].includes(place) ? 'short' : 'long')

const BULLETS = 3
const UP = '↑'
const DOWN = '↓'

/** The most characters of a short post: X's, less the link it counts beside it. */
const SHORT_MAX = X_MAX - X_LINK

/** The label as the card says it, without what the server adds after a " · " (counted once per day). */
const plain = (label: string) => label.split(' · ')[0]

/** The count in a number the server wrote ("1,234"), for the word beside it to agree with. */
const countOf = (big: string) => Number(big.replace(/\D/g, ''))

const item = (r: { name: string; value: string }) => `${r.name} ${r.value}`

/** What the card says beyond its headline: the change against the period before, then the lines a card has. */
function lines(f: Facts): { change?: string; items: string[] } {
  const items = f.rows ?? []
  switch (f.template) {
    case 'overview':
      return {
        change: f.dir && f.change ? t.against(f.dir > 0 ? UP : DOWN, f.change.replace(/^[+\-−]/, ''), f.vs ?? '') : undefined,
        items: items.slice(0, 1).map((r) => t.topSource(r.name)),
      }
    case 'milestone':
      return { items: f.foot ? [f.foot] : [] }
    case 'search':
      return { items: [...(f.stats ?? []), ...items].slice(0, BULLETS).map(item) }
    case 'toppage':
      return { items: items.slice(0, 1).map(item) }
    case 'bestday':
      return { items: [] }
    default:
      return { items: items.slice(0, BULLETS).map(item) }
  }
}

/** The headline: the card's strongest number first. */
function head(f: Facts): string {
  const { domain, foot: period, big, label } = f
  switch (f.template) {
    case 'overview':
      return t.head.overview(big, plain(label), domain, period)
    case 'changed':
      return t.head.changed(domain, period, label)
    case 'bestday':
      return t.head.bestday(domain, big, t.person(countOf(big)), period)
    case 'milestone':
      return t.head.milestone(domain, big, label)
    case 'sources':
      return t.head.sources(domain, period)
    case 'search':
      return t.head.search(domain, period)
    case 'toppage':
      return t.head.toppage(domain, period)
    default:
      return t.head.leaderboard(domain, period)
  }
}

/** A text cut to `max` characters at a word, never in the middle of one. */
function cut(text: string, max: number): string {
  if (chars(text) <= max) return text
  const room = Array.from(text).slice(0, max - 1).join('')
  const at = room.lastIndexOf(' ')
  return `${(at > 0 ? room.slice(0, at) : room).trimEnd()}…`
}

/** A short post: the headline and one line under it; the list shrinks first, then the headline is cut at a word. */
function short(f: Facts): string {
  const { change, items } = lines(f)
  const parts = [change, ...items].filter((p): p is string => !!p)
  const top = head(f)
  const write = () => [top, parts.join(' · ')].filter(Boolean).join('\n')
  while (parts.length > 0 && chars(write()) > SHORT_MAX) parts.pop()
  return cut(write(), SHORT_MAX)
}

/** A longer post: the headline, up to three lines, and the closing line. */
function long(f: Facts, brand: boolean): string {
  const { change, items } = lines(f)
  const under = [change, ...items.map((i) => `· ${i}`)].filter((p): p is string => !!p).slice(0, BULLETS)
  return [head(f), under.join('\n'), brand ? t.closing : t.closingPlain].filter(Boolean).join('\n\n')
}

/**
 * The post for a place: from the card's facts, or the server's own line (`fallback`) when the card has nothing behind
 * it. `brand` is whether trckable may be named (a site that hides the brand on its cards says nothing of it).
 */
export function writePost(facts: Facts | undefined, fallback: string, place: Place, brand: boolean): string {
  if (!facts || facts.empty) return fallback
  return shapeOfPlace(place) === 'short' ? short(facts) : long(facts, brand)
}
