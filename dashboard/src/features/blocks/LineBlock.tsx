import { LiveLineChart } from '../../v2/live/LiveLineChart'
import { copy } from './copy'
import { Frame } from './Frame'
import type { LineBlock as Line } from './types'

/** The series as a small line: Live's own chart, each point a share of the tallest. */
export function LineBlock({ b }: { b: Line }) {
  const { points, labels } = b.data
  const top = Math.max(1, ...points)
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      <div className="mk blk-chart" role="img" aria-label={copy.chart(b.title, labels?.[0] ?? '', labels?.[1] ?? '')}>
        <LiveLineChart heights={points.map((p) => (p / top) * 100)} beat={0} />
      </div>
      {labels && (
        <p className="blk-axis">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </p>
      )}
    </Frame>
  )
}
