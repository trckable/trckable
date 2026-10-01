// Replay's playhead on the main chart: a thin line in the series colour that
// fades out towards the top, the dot riding the line's own value, and a small
// chip at the top naming the moment. Its own chunk (TimeChart loads it when
// the chart appears), so the first load does not carry it. While Replay
// plays, its playhead (a position between two points) moves the cut, the
// line, the dot and the chip every frame, straight on the elements: a
// transform, no render, no glide restarting at each point. At any other time
// they sit on the picked point and glide to the next one. ReplayHead.css.
import { useEffect, useRef } from 'react'
import { playhead } from '../features/overview/playhead'
import type { Bucket } from '../lib/api'
import { momentLabel } from './momentLabel'
import { pointOn } from './smooth'
import './ReplayHead.css'

interface LineProps {
  id: string
  tone: string
  bottom: number
  /** The picked point, or null: the line alone. */
  at: number | null
  driven: boolean
  quiet: boolean
  x: (i: number) => number
  y: (v: number) => number
  vals: number[]
}

export function ReplayLine({ id, tone, bottom, at, driven, quiet, x, y, vals }: LineProps) {
  const place = at != null && !driven ? `translate(${x(at)} ${y(vals[at] ?? 0)})` : undefined
  const line = useRef<SVGLineElement>(null)
  const dot = useRef<SVGGElement>(null)
  useEffect(() => {
    const wrap = line.current?.closest<HTMLElement>('.chart-wrap')
    if (!driven || !wrap) return
    const pts = vals.map((v, i) => [x(i), y(v)])
    const moved = () => wrap.querySelectorAll<SVGElement>('.chart-dim, .chart-cut')
    let last: number | null = null // where the playhead was drawn last
    const run = () => {
      const pos = playhead.get()
      if (pos < 0) return
      const [px, py] = pointOn(pts, pos)
      last = px
      // On the grey and the crosshair themselves: a variable set on the
      // wrapper would restyle everything under it, every frame.
      for (const el of moved()) el.style.transform = `translateX(${px.toFixed(2)}px)`
      dot.current?.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`)
    }
    run()
    const off = playhead.subscribe(run)
    return () => {
      off()
      // Handed back to the variable at the same place, so the cut fades out
      // where the playhead stopped instead of jumping to where it last was.
      if (last != null) wrap.style.setProperty('--cut', `${last}px`)
      moved().forEach((el) => (el.style.transform = ''))
    }
  }, [driven, x, y, vals])
  return (
    <>
      {/* The series colour at the axis, gone at the top. In user space, since a vertical line has no box of its own to measure. */}
      <linearGradient id={id + '-head'} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={bottom}>
        <stop offset="0" stopColor={tone} stopOpacity="0" />
        <stop offset="1" stopColor={tone} />
      </linearGradient>
      {/* The line sits at the cut variable, so it never lags the grey. The pointer's own cursor is CursorMark. */}
      <line ref={line} className="chart-cut is-replay" x1={0} x2={0} y1={0} y2={bottom} stroke={`url(#${id}-head)`} />
      {at != null && (
        <g ref={dot} className="replay-dot" transform={place}>
          {!quiet && <circle className="replay-ring" r="11" fill={tone} stroke={tone} />}
          <circle r={quiet ? 4 : 6} fill={tone} stroke="var(--surface)" strokeWidth={quiet ? 2 : 3} />
        </g>
      )}
    </>
  )
}

/** Half the chip's width, kept clear of both edges of the chart. */
const EDGE = 50
const place = (px: number, width: number) => `translateX(${Math.max(EDGE, Math.min(px, width - EDGE)).toFixed(2)}px) translateX(-50%)`

interface ChipProps {
  labels: string[]
  bucket: Bucket
  /** The picked point. */
  at: number
  /** The chart's x for a position between points, and its width. */
  x: (i: number) => number
  width: number
  /** Replay plays: the playhead moves the chip. */
  driven: boolean
}

export function ReplayChip({ labels, bucket, at, x, width, driven }: ChipProps) {
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!driven) return
    let shown = -1
    const run = () => {
      const pos = playhead.get()
      const chip = el.current
      if (pos < 0 || !chip) return
      chip.style.transform = place(x(pos), width)
      const i = Math.max(0, Math.min(labels.length - 1, Math.floor(pos + 1e-9)))
      if (i !== shown) chip.textContent = momentLabel(labels[(shown = i)] ?? '', bucket)
    }
    run()
    return playhead.subscribe(run)
  }, [driven, x, width, labels, bucket])
  return (
    <span ref={el} className="replay-chip num" aria-hidden="true" style={driven ? undefined : { transform: place(x(at), width) }}>
      {driven ? '' : momentLabel(labels[at] ?? '', bucket)}
    </span>
  )
}
