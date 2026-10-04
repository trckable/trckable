// The last hour as a chart for the story: the line draws itself, the usual is a
// dashed level, the start of the climb is marked and the peak is labelled. Plain
// SVG in the page's tokens; it has a text name for assistive tech and nothing in
// it moves with reduced motion (surge.css).
import { clock, peakSlice, startSlice, type Surge } from './surge'
import { signals } from './copy'

const t = signals.surge
const W = 600
const H = 176
const PAD = { l: 8, r: 8, t: 30, b: 8 }

export function SurgeChart({ surge, tz }: { surge: Surge; tz: string }) {
  const st = surge.story
  if (!st || st.series.length < 2) return null
  const n = st.series.length
  const top = Math.max(...st.series, surge.usual, 1) * 1.1
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1)
  const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b)
  const line = st.series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`
  const start = startSlice(st)
  const peak = peakSlice(st)
  const startText = st.start ? clock(st.start, tz) : ''
  // A label that would run off the right edge sits to the left of its mark.
  const anchor = (i: number) => (x(i) > W - 70 ? 'end' : 'start')
  return (
    <figure className="sgm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.chartLabel(startText, st.peak)} preserveAspectRatio="none">
        <line className="usual" x1={PAD.l} x2={W - PAD.r} y1={y(surge.usual)} y2={y(surge.usual)} />
        <path className="ar" d={area} />
        <path className="ln" pathLength="1" d={line} vectorEffect="non-scaling-stroke" />
        {start !== undefined && (
          <g className="mark">
            <line x1={x(start)} x2={x(start)} y1={PAD.t - 8} y2={H - PAD.b} />
            <text x={x(start) + (anchor(start) === 'end' ? -6 : 6)} y={PAD.t - 12} textAnchor={anchor(start)}>
              {t.startMark(startText)}
            </text>
          </g>
        )}
        <circle className="pt" cx={x(peak)} cy={y(st.peak)} r="4.5" vectorEffect="non-scaling-stroke" />
        <text className="peak" x={x(peak) + (anchor(peak) === 'end' ? -9 : 9)} y={y(st.peak) - 8} textAnchor={anchor(peak)}>
          {t.peakMark(st.peak)}
        </text>
      </svg>
      <figcaption>
        <span>{t.hourAgo}</span>
        <span>{t.nowEdge}</span>
      </figcaption>
    </figure>
  )
}
