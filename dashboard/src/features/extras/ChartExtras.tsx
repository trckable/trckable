// What the chart and the page draw beyond the numbers, in one chunk, asked for
// once the page is up (a chart never waits for it): the pace line in the
// Visitors tile, and the moments over its plot (which bring the card the Data
// view says on its own, now and then).
import MomentLayer from '../moments/MomentLayer'
import PaceLine from './PaceLine'

export type ExtraProps =
  | ({ part: 'pace' } & Parameters<typeof PaceLine>[0])
  | ({ part: 'moments' } & Parameters<typeof MomentLayer>[0])

export default function ChartExtras(p: ExtraProps) {
  switch (p.part) {
    case 'pace':
      return <PaceLine {...p} />
    case 'moments':
      return <MomentLayer {...p} />
  }
}
