// Replay as a story: the period's moments on a rail under the chart, each
// popping as the playhead passes it; ← and → jump between them, Esc stops,
// and the end is a card that sums the period up. Its own chunk, loaded when
// Replay starts. Only aggregates reach it (see the server's moments route).
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { call, reportURL, type Bucket, type ReportQuery } from '../../lib/api'
import { isShared } from '../../lib/me'
import { bucketLabel } from '../../charts/timeScale'
import { channelLabel } from '../../lib/palette'
import { markUsed } from '../moments/store'
import { copy } from './copy'
import { neighbour, periodOf, place, salesIn, type Moment } from './moments'
import { StoryEnd } from './StoryEnd'
import { wordsOf } from './words'
import './Story.css'

export interface StoryProps {
  site: string
  query: ReportQuery
  bucket: Bucket
  /** The chart's own bucket keys and visitors, point by point. */
  labels: string[]
  visitors: number[]
  /** The playhead, as a point of the chart. */
  at: number | null
  playing: boolean
  phase: 'on' | 'end'
  /** Writes an amount; only given where revenue may be shown. */
  money?: (minor: number) => string
  total: string
  /** The period's top channel, as the report names it. */
  source?: string
  /** First and last day shown. */
  period: [string, string]
  onJump: (i: number) => void
  onStops: (stops: number[]) => void
  onStop: () => void
  onAgain: () => void
  onShare: () => void
}

/** A pop near either edge opens inwards, so it never leaves the card. */
function pull(i: number, n: number) {
  const f = n > 1 ? i / (n - 1) : 0.5
  if (f < 0.2) return '-12px'
  return f > 0.8 ? 'calc(-100% + 12px)' : '-50%'
}

/** Where a point sits along the rail, in step with the chart's plot. */
const leftOf = (i: number, n: number) => `calc(var(--plot-l) + (100% - var(--plot-l)) * ${n > 1 ? i / (n - 1) : 0.5})`

export default function Story(p: StoryProps) {
  const [list, setList] = useState<Moment[]>([])
  useEffect(() => markUsed('replay'), []) // a card that offers Replay is not for someone who has played it
  const url = reportURL(p.site, { ...p.query, compare: undefined, daily: false, deep: false, bucket: p.bucket }).replace('/report?', '/moments?')
  useEffect(() => {
    // A shared link has no moments: its reader gets the plain replay.
    if (isShared()) return
    const ctl = new AbortController()
    call<{ moments: Moment[] }>('GET', url, undefined, ctl.signal, true)
      .then((r) => setList(r.moments ?? []))
      .catch(() => setList([]))
    return () => ctl.abort()
  }, [url])
  // Keyed by content: the chart hands over new arrays every render.
  const labelsKey = p.labels.join(',')
  const hasMoney = !!p.money
  const placed = useMemo(() => place(list, labelsKey.split(','), hasMoney), [list, labelsKey, hasMoney])
  const { onStops, onJump, onStop } = p
  useEffect(() => onStops(placed.map((x) => x.i)), [placed, onStops])

  const at = p.at ?? -1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable], svg, [role="dialog"]')) return
      if (e.key === 'Escape') {
        onStop()
        return
      }
      const dir = ({ ArrowRight: 1, ArrowLeft: -1 } as const)[e.key as 'ArrowRight' | 'ArrowLeft']
      if (!dir) return
      const to = neighbour(placed, at, dir)
      if (to == null) return
      e.preventDefault()
      onJump(to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placed, at, onJump, onStop])

  // The pop shows the moments the playhead is on, and stays a moment after.
  const [pop, setPop] = useState<number | null>(null)
  const here = placed.find((x) => x.i === at)
  if (here && pop !== here.i) setPop(here.i)
  useEffect(() => {
    if (pop == null || !p.playing) return
    const t = setTimeout(() => setPop(null), 2400)
    return () => clearTimeout(t)
  }, [pop, p.playing])
  const shown = placed.find((x) => x.i === pop)
  const n = p.labels.length
  const prev = neighbour(placed, at, -1)
  const next = neighbour(placed, at, 1)

  if (p.phase === 'end')
    return <StoryEnd period={periodOf(p.period)} total={p.total} labels={p.labels} visitors={p.visitors} bucket={p.bucket} source={p.source && channelLabel(p.source)} sales={p.money ? salesIn(placed) : 0} onShare={p.onShare} onAgain={p.onAgain} onClose={onStop} />

  return (
    <div className="story">
      <div className="story-rail" role="group" aria-label={copy.moments}>
        {shown && at >= 0 && (
          <div key={shown.i} className="story-pop" style={{ left: leftOf(shown.i, n), '--pull': pull(shown.i, n) } as CSSProperties} role="status">
            {shown.moments.slice(0, 3).map((m, k) => {
              const w = wordsOf(m, p.money)
              return (
                <div key={k} className={'story-pop-row ' + m.kind}>
                  <w.icon size={14} strokeWidth={2} aria-hidden="true" />
                  <b>{w.line}</b>
                  {w.sub && <span className="faint">{w.sub}</span>}
                </div>
              )
            })}
          </div>
        )}
        {placed.map((x) => (
          <button
            key={x.i}
            type="button"
            className={'story-dot ' + x.moments[0].kind + (x.i <= at ? ' lit' : '')}
            style={{ left: leftOf(x.i, n) }}
            aria-label={copy.jumpTo(wordsOf(x.moments[0], p.money).line, bucketLabel(p.labels[x.i], p.bucket, true))}
            title={wordsOf(x.moments[0], p.money).line}
            onClick={() => onJump(x.i)}
          />
        ))}
      </div>
      <span className="story-keys">
        <button type="button" className="btn icon ghost" disabled={prev == null} onClick={() => prev != null && onJump(prev)} aria-label={copy.prev} title={copy.prev}>
          <ChevronLeft size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="btn icon ghost" disabled={next == null} onClick={() => next != null && onJump(next)} aria-label={copy.next} title={copy.next}>
          <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="btn icon ghost" onClick={onStop} aria-label={copy.stop} title={copy.stop}>
          <X size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}
