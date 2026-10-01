// The main chart behind a boundary: Dashboard draws this one. If the chart
// throws, a short line stands in its place until its numbers change.
import { Boundary } from '../components/Boundary'
import { TimeChart as Chart, type TimeChartProps } from './TimeChart'

export type { Pulse } from './TimeChart'

export const TimeChart = (p: TimeChartProps) => (
  <Boundary reset={p.values}>
    <Chart {...p} />
  </Boundary>
)
