// Which days a source brought its first visits or a jump, and where those sit
// on a chart. Pure: model.test.ts.
import type { Bucket, Filter } from '../../lib/api'
import { bucketOf } from '../notes/markers'
import { KNOWN } from './sources'

/** Fewest visitors that are worth a marker, and the least a jump adds. */
export const MIN_ADDED = 5
/** A jump is at least this many times what the week before brought. */
export const TIMES = 3
/** A day is a new high: this many times the best of the days before it, so a climb already marked is not marked again day after day. */
const RISE = 1.5
/** The days before a day that say what is usual for it. */
const WEEK = 7
/** At most this many days of one source are marked: its biggest. */
const PER_SOURCE = 3

export interface Jump {
  /** 'source' for a known source, 'link' for a tagged link. */
  kind: 'source' | 'link'
  /** Who: a known source's id, or the link's value. */
  id: string
  name: string
  badge: string
  day: string
  /** What it brought that day. */
  visitors: number
  /** What it added to the usual: the figure the marker wears. */
  added: number
  /** First visits ever seen in the window, not a rise. */
  first: boolean
  /** What "See these visitors" narrows the numbers to. */
  filter: Filter
}

/** The days of one series on which it brought its first visits or jumped, biggest first. Pure arithmetic over the daily visitors. */
export function jumpDays(days: string[], values: number[]): { day: string; visitors: number; added: number; first: boolean }[] {
  const out: { day: string; visitors: number; added: number; first: boolean }[] = []
  for (let i = 1; i < values.length; i++) {
    const v = values[i] ?? 0
    const before = values.slice(Math.max(0, i - WEEK), i)
    const base = before.reduce((a, b) => a + b, 0) / before.length
    const added = v - Math.round(base)
    if (v >= MIN_ADDED && added >= MIN_ADDED && v >= TIMES * base && v >= RISE * Math.max(...before)) out.push({ day: days[i], visitors: v, added, first: base === 0 })
  }
  return out.sort((a, b) => b.added - a.added).slice(0, PER_SOURCE)
}

/** The jumps of the known sources, from the daily visitors of each host (the answer to the sparkline request). */
export function sourceJumps(days: string[], rows: Record<string, number[]>): Jump[] {
  const out: Jump[] = []
  for (const k of KNOWN) {
    const sum = days.map((_, i) => k.hosts.reduce((a, h) => a + (rows[h]?.[i] ?? 0), 0))
    for (const j of jumpDays(days, sum)) {
      const i = days.indexOf(j.day)
      // The host that sent most that day is the one a click filters to.
      const top = [...k.hosts].sort((a, b) => (rows[b]?.[i] ?? 0) - (rows[a]?.[i] ?? 0))[0]
      out.push({ kind: 'source', id: k.id, name: k.name, badge: k.badge, ...j, filter: { dim: 'referrer', value: top } })
    }
  }
  return out
}

export interface Placed {
  i: number
  jump: Jump
}

export function place(jumps: Jump[], labels: string[], bucket: Bucket): Placed[] {
  const out: Placed[] = []
  for (const jump of jumps) {
    const i = bucketOf(jump.day, labels, bucket)
    if (i >= 0) out.push({ i, jump })
  }
  return out
}

export interface Mark {
  i: number
  at: number
  jump: Jump
  more: Jump[]
}

/** A marker is at most this wide in pixels, count included. */
export const GAP = 66
/** Most markers on one chart. */
export const MAX = 6

/** The biggest jumps first; any that would touch one already placed join it ("Hacker News +40" and "+2"). */
export function cluster(placed: Placed[], x: (i: number) => number, edge: [number, number], max = MAX, gap = GAP): Mark[] {
  const out: Mark[] = []
  for (const p of [...placed].sort((a, b) => b.jump.added - a.jump.added)) {
    const at = Math.min(Math.max(x(p.i), edge[0]), edge[1])
    const near = out.find((m) => Math.abs(m.at - at) < gap)
    if (near) near.more.push(p.jump)
    else if (out.length < max) out.push({ i: p.i, at, jump: p.jump, more: [] })
  }
  return out.sort((a, b) => a.i - b.i)
}

/** The one source jump that explains most of a day's rise over the period's usual, or none. */
export function biggest(jumps: Jump[], labels: string[], visitors: number[]): Jump | undefined {
  if (labels.length < 3) return undefined
  const top = [...jumps].sort((a, b) => b.added - a.added)[0]
  if (!top) return undefined
  const i = labels.findIndex((l) => l.slice(0, 10) === top.day)
  if (i < 0) return undefined
  const rest = visitors.filter((_, k) => k !== i)
  const usual = rest.reduce((a, b) => a + b, 0) / rest.length
  const rise = (visitors[i] ?? 0) - usual
  return rise > 0 && top.added >= rise / 2 ? top : undefined
}

/** The jumps of tagged links, from each link's visitors per day over the 30 days up to `to`. */
export function linkJumps(days: string[], links: { dim: 'referrer' | 'source'; value: string; spark: number[] }[], label: (value: string) => string): Jump[] {
  const out: Jump[] = []
  for (const l of links) {
    const spark = l.spark.slice(-days.length)
    const from = days.length - spark.length
    for (const j of jumpDays(days.slice(from), spark)) out.push({ kind: 'link', id: `${l.dim}:${l.value}`, name: label(l.value), badge: '', ...j, filter: { dim: l.dim, value: l.value } })
  }
  return out
}
