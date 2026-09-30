// The main chart's x labels, as before: a label every few buckets, the first
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
