// Pageviews per minute over the last 30 minutes: one glowing line that
// rises as visits arrive and moves on each minute. In-house SVG, like every
// chart here; the curve is TimeChart's, so the two never draw differently.
// Hover, touch or the arrow keys read one minute, as on the main chart;
// a click, Enter or a second tap on the same minute opens it in Data.
import { NoData } from '../../kit/NoData'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Tip } from '../../charts/Tip'
import { smooth } from '../../charts/TimeChart'
import { CursorMark, CursorPill } from '../../charts/Cursor'
import { useHover } from '../../charts/useHover'
import { fmtInt } from '../../lib/format'
import { useTween } from '../../lib/motion'
import { copy } from './copy'

const PAD_T = 14
const PAD_B = 6
// Room for the glowing head at the right end, which would otherwise be cut.
const PAD_X = 6

export function LiveLine({ values, onOpen }: { values: number[]; onOpen?: (ago: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // The chart fills what the panel leaves it, so Live fits one screen.
  const [[w, H], setSize] = useState([640, 180])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize([Math.max(200, e.contentRect.width), Math.max(96, e.contentRect.height)]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const vals = useTween(values, 480)
  // Room above the busiest minute, and a floor so one visit is not a spike.
  const max = useTween(Math.max(4, Math.ceil(Math.max(...values) * 1.2)), 480)
  const n = vals.length
  const plotH = H - PAD_T - PAD_B
  const x = (i: number) => (n <= 1 ? w / 2 : PAD_X + (i / (n - 1)) * (w - 2 * PAD_X))
  const y = (v: number) => PAD_T + plotH - (v / (max || 1)) * plotH
  const line = smooth(vals.map((v, i) => [x(i), y(v)]))
  const area = n ? `${line}L${x(n - 1).toFixed(1)} ${H}L${x(0).toFixed(1)} ${H}Z` : ''
  // The running minute is not over: like the main chart's partial bucket, it
  // is drawn dashed, so a minute that just began does not read as a drop.
  const done = n > 2 ? smooth(vals.slice(0, -1).map((v, i) => [x(i), y(v)])) : line
  const running = n > 2 ? `M${x(n - 2).toFixed(1)} ${y(vals[n - 2]).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vals[n - 1]).toFixed(1)}` : ''
  const total = values.reduce((a, b) => a + b, 0)
  const last = n ? vals[n - 1] : 0
  const hover = useHover(n, PAD_X, w - 2 * PAD_X)
  const at = hover.i != null && hover.i < n ? hover.i : null
  // A touch shows a minute first; only a tap on the minute already shown opens it.
  const tapped = useRef<number | null>(null)
  const open = (i: number | null) => {
    if (onOpen && i != null) onOpen(n - 1 - i)
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const again = at === tapped.current
    tapped.current = at
    if (e.pointerType !== 'touch' || again) open(at)
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(at)
      return
    }
    hover.handlers.onKeyDown(e)
  }
  const tip = at == null ? null : {
    x: x(at),
    y: y(vals[at]),
    body: (
      <>
        <b>{copy.minuteAgo(n - 1 - at)}</b>
        <span className="num">{copy.minuteViews(fmtInt(values[at] ?? 0), values[at] ?? 0)}</span>
      </>
    ),
  }
  return (
    <div className="live-chart">
      <div ref={ref} className="live-line">
        <svg
          width={w}
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          role="img"
          aria-label={copy.chartLabel(total)}
          tabIndex={n ? 0 : -1}
          style={{ touchAction: 'pan-y' }}
          className={onOpen ? 'can-open' : undefined}
          {...hover.handlers}
          onKeyDown={onKeyDown}
          onPointerDown={hover.handlers.onPointerMove}
          onPointerUp={onPointerUp}
        >
          <defs>
            <linearGradient id="live-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#live-area)" />
          <path className="live-glow" d={done} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {running && <path d={running} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeDasharray="3 5" strokeLinecap="round" />}
          {n > 0 && <circle className="live-head" cx={x(n - 1)} cy={y(last)} r="4.5" fill="var(--accent)" />}
          {at != null && <CursorMark x={x(at)} y={y(vals[at])} top={PAD_T} bottom={H} />}
        </svg>
        {n > 0 && values.every((v) => v === 0) && (
          <span className="chart-nodata" style={{ left: 0, top: PAD_T, height: H - PAD_T * 2 }}>
            <NoData />
          </span>
        )}
        <Tip at={tip} width={w} />
        {at != null && <CursorPill x={x(at)} w={w} text={copy.minuteAgo(n - 1 - at)} />}
      </div>
      <div className="live-axis faint num" aria-hidden="true">
        <span>{copy.chartStart}</span>
        <span>{copy.chartEnd}</span>
      </div>
    </div>
  )
}
