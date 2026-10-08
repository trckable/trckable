// Moments that belong together are one: the same kind, from the same cause, on
// buckets that follow each other (three days of new traffic from google.com are
// one moment, Sep 27 to 29). A span is what the chart draws as a soft band with
// one label, and what a click tells as a story. Pure: spans.test.ts.
import { byScore, type Pin } from './pins'
import type { Placed } from './marks'

export interface Span {
  id: string
  /** The first and the last bucket of the chart it covers. */
  i0: number
  i1: number
  /** Up (more than usual, a first, a sale) or down (fewer buyers). */
  dir: 'up' | 'down'
  /** What it is made of, the first day first. */
  pins: Pin[]
  /** The pin that speaks for it: the one that matters most. */
  main: Pin
  score: number
  /** The first and last day, "2026-09-27". */
  from: string
  to: string
}

/** Same kind and same cause: the filter a click applies (a source, a channel). A milestone or an assistant's first visit is one event, never a stretch of days: each is its own. */
const ALONE: Pin['kind'][] = ['milestone', 'ai']
const sameCause = (p: Pin) => (ALONE.includes(p.kind) ? p.id : `${p.kind}|${p.filters.map((f) => `${f.dim}:${f.value}`).join(',')}`)

const DOWN: Pin['kind'][] = ['drop']

/** The chart's placed pins, joined: a pin one bucket after another of its cause joins it. */
export function groupSpans(placed: Placed[]): Span[] {
  const by = new Map<string, Placed[]>()
  for (const p of placed) by.set(sameCause(p.pin), [...(by.get(sameCause(p.pin)) ?? []), p])
  const out: Span[] = []
  for (const list of by.values()) {
    list.sort((a, b) => a.i - b.i)
    let run: Placed[] = []
    const flush = () => {
      if (run.length) out.push(make(run))
      run = []
    }
    for (const p of list) {
      if (run.length && p.i > run[run.length - 1].i + 1) flush()
      run.push(p)
    }
    flush()
  }
  return out.sort((a, b) => a.i0 - b.i0 || b.score - a.score)
}

function make(run: Placed[]): Span {
  const pins = run.map((r) => r.pin)
  const main = [...pins].sort(byScore)[0]
  const days = pins.map((p) => p.day ?? '').filter(Boolean).sort()
  const i0 = run[0].i
  const i1 = run[run.length - 1].i
  return {
    id: `${main.kind}:${main.filters.map((f) => f.value).join(',')}:${i0}-${i1}`,
    i0,
    i1,
    dir: DOWN.includes(main.kind) ? 'down' : 'up',
    pins,
    main,
    // Longer is bigger news, a little: three days of it outrank one.
    score: main.score + Math.min(10, 4 * (i1 - i0)),
    from: days[0] ?? '',
    to: days[days.length - 1] ?? '',
  }
}

/** The `max` most important spans that do not cover one another, in time order. */
export function pickSpans(spans: Span[], max: number): Span[] {
  const out: Span[] = []
  for (const s of [...spans].sort((a, b) => b.score - a.score || a.i0 - b.i0)) {
    if (out.length >= max) break
    if (out.some((o) => s.i0 <= o.i1 && o.i0 <= s.i1)) continue
    out.push(s)
  }
  return out.sort((a, b) => a.i0 - b.i0)
}

/** What the days brought above their usual, in visitors: a spike is its visitors less what that bucket usually has; new traffic (no usual) is all of them. Undefined where a span is not about visitors. */
export function extraOf(span: Span): number | undefined {
  const spikes = span.pins.filter((p) => p.kind === 'spike')
  if (!spikes.length) return undefined
  return Math.round(spikes.reduce((n, p) => n + Math.max(0, (p.n.visitors ?? 0) - (p.n.factor ? (p.n.visitors ?? 0) / p.n.factor : 0)), 0))
}

/** The usual for the same buckets, where the server gave a factor for each of them. */
export function usualOf(span: Span): number | undefined {
  const spikes = span.pins.filter((p) => p.kind === 'spike')
  if (!spikes.length || spikes.some((p) => !p.n.factor)) return undefined
  return Math.round(spikes.reduce((n, p) => n + (p.n.visitors ?? 0) / (p.n.factor ?? 1), 0))
}

/** What came after: the mean of the (up to three) buckets following the span against the usual per bucket. Undefined when nothing follows or there is no usual. */
export function afterOf(span: Span, visitors: number[]): { each: number; kept: boolean } | undefined {
  const usual = usualOf(span)
  const n = span.i1 - span.i0 + 1
  const next = visitors.slice(span.i1 + 1, span.i1 + 4)
  if (!usual || !next.length) return undefined
  const each = Math.round(next.reduce((a, b) => a + b, 0) / next.length)
  return { each, kept: each >= (usual / n) * 2 }
}
