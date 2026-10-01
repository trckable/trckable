// The chart's two extras in one chunk: the pace line in its head and the rings
// over its plot. Asked for once the page is up; a chart never waits for either.
import PaceLine from './PaceLine'
import ChartRings from './ChartRings'

export type ExtraProps = ({ part: 'pace' } & Parameters<typeof PaceLine>[0]) | ({ part: 'rings' } & Parameters<typeof ChartRings>[0])

export default function ChartExtras(p: ExtraProps) {
  return p.part === 'pace' ? <PaceLine {...p} /> : <ChartRings {...p} />
}
