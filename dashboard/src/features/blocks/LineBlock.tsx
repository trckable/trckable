import { LiveLineChart } from '../../v2/live/LiveLineChart'
import { copy } from './copy'
import { Frame } from './Frame'
import { axisLabel } from './format'
import type { LineBlock as Line } from './types'

/** The series as a small line: Live's own chart, each point a share of the tallest. */
export function LineBlock({ b }: { b: Line }) {
  const { points, labels } = b.data
  const top = Math.max(1, ...points)
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      <div className="mk blk-chart" role="img" aria-label={labels ? copy.chart(b.title, axisLabel(labels[0], false), axisLabel(labels[1], true)) : b.title}>
        <LiveLineChart heights={points.map((p) => (p / top) * 100)} beat={0} />
      </div>
      {labels && (
        <p className="blk-axis">
          <span>{axisLabel(labels[0], false)}</span>
          <span>{axisLabel(labels[1], true)}</span>
        </p>
      )}
    </Frame>
  )
}
