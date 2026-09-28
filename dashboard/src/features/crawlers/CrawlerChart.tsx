// One line per crawler over the period's days.
import type { CrawlerReport } from '../../lib/api'
import { colorOf } from './colors'

type Series = CrawlerReport['series'][number]

export function CrawlerChart({ series, buckets, label }: { series: Series[]; buckets: string[]; label: string }) {
  const peak = Math.max(1, ...series.flatMap((s) => s.values))
  return (
    <div className="crawl-chart">
      <svg viewBox={`0 0 ${Math.max(2, buckets.length - 1) * 10} 100`} preserveAspectRatio="none" role="img" aria-label={label}>
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={colorOf(s.name)}
            strokeWidth="1.6"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={s.values.map((v, i) => `${i * 10},${100 - (v / peak) * 92}`).join(' ')}
          />
        ))}
      </svg>
      <div className="crawl-axis faint num">
        <span>{buckets[0]?.slice(5, 10)}</span>
        <span>{buckets[buckets.length - 1]?.slice(5, 10)}</span>
      </div>
    </div>
  )
}
