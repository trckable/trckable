// The main chart's axes. The x labels, as before: a label every few buckets, the first
// starting at its point and the last ending there. A label under the pointer's
// date pill gives way to it.
import type { Bucket } from '../lib/api'
import { anchorAt } from './PeakLabel'
import { bucketLabel } from './timeScale'

/** skip: the pointer's x; labels near it give way to the pill under the cursor. */
export function XLabels({ labels, bucket, every, x, y, skip }: { labels: string[]; bucket: Bucket; every: number; x: (i: number) => number; y: number; skip: number | null }) {
  return (
    <>
      {labels.map((t, i) =>
        i % every === 0 && !(skip != null && Math.abs(x(i) - skip) < 60) ? (
          <text key={t} x={x(i)} y={y} fontSize="11" fill="var(--text-3)" textAnchor={anchorAt(i, labels.length)} className="num">
            {bucketLabel(t, bucket)}
          </text>
        ) : null,
      )}
    </>
  )
}

/** The y labels: a gridline for each above zero, its label in the left margin. */
export function YTicks({ ticks, y, w, padL, write }: { ticks: number[]; y: (v: number) => number; w: number; padL: number; write: (n: number) => string }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          {t > 0 && <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray="2 4" />}
          <text x={0} y={y(t) + 4} className="num" fontSize="11" fill="var(--text-3)">
            {write(t)}
          </text>
        </g>
      ))}
    </>
  )
}
