// The main chart's frame: two hairlines and three quiet y labels, dotted
// separators at each midnight of an hourly chart, and the x labels.
import { fmtCompact } from '../lib/format'
import { anchorAt } from './PeakLabel'
import { PAD_L, PAD_T } from './plot'
import { bucketLabel } from './timeScale'
import type { Bucket } from '../lib/api'

export function YAxis({ ticks, y, w }: { ticks: number[]; y: (v: number) => number; w: number }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          {t > 0 && <line x1={PAD_L} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeOpacity="0.7" />}
          <text x={PAD_L - 8} y={y(t) + 3.5} textAnchor="end" className="num" fontSize="10.5" fill="var(--text-4)">
            {fmtCompact(t)}
          </text>
        </g>
      ))}
    </>
  )
}

const isMidnight = (t: string) => t.slice(11, 16) === '00:00'

/** A dotted line where each new day begins, on a chart by the hour. */
export function DaySeams({ labels, bucket, x, bottom }: { labels: string[]; bucket: Bucket; x: (i: number) => number; bottom: number }) {
  if (bucket !== 'hour') return null
  return (
    <>
      {labels.map((t, i) => (i > 0 && isMidnight(t) ? <line key={t} x1={x(i)} x2={x(i)} y1={PAD_T} y2={bottom} stroke="var(--grid)" strokeOpacity="0.5" strokeDasharray="1 3" /> : null))}
    </>
  )
}

const tone = (dim: boolean) => (dim ? 'var(--text-4)' : 'var(--text-2)')

/** skip: the pointer's x; labels near it give way to the date pill under the cursor. */
export function XLabels({ labels, bucket, every, x, y, skip }: { labels: string[]; bucket: Bucket; every: number; x: (i: number) => number; y: number; skip: number | null }) {
  return (
    <>
      {labels.map((t, i) => {
        if (i % every || (skip != null && Math.abs(x(i) - skip) < 60)) return null
        // By the hour a day's name is its midnight; the hours between are dimmer.
        const hourly = bucket === 'hour'
        const dim = hourly && !isMidnight(t)
        const fill = hourly ? tone(dim) : 'var(--text-3)'
        return (
          <text key={t} x={x(i)} y={y} fontSize={dim ? 10.5 : 11} fill={fill} textAnchor={anchorAt(i, labels.length)} className="num">
            {bucketLabel(t, bucket)}
          </text>
        )
      })}
    </>
  )
}
