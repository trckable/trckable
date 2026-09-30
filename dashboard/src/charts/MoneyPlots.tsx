// Everything that draws revenue, as one chunk: it loads once a chart has
// revenue to show (charts/chartParts) and never for a site without payments.
import { Caps, Columns } from './Columns'
import { RevenuePlot } from './RevenuePlot'

export { RevenuePlot }

interface MainColumnsProps {
  values: number[]
  /** Last period: a dashed cap on each day. */
  ghost?: number[]
  x: (i: number) => number
  base: number
  h: number
  max: number
  w: number
  hover: number | null
  partialLast?: boolean
  /** The chart's paint (TimeDefs). */
  id: string
  /** A quiet grey copy, for what Replay has not reached. */
  grey?: boolean
}

/** The whole chart in money: columns, and last period's caps over them. */
export function MainColumns({ id, ghost, grey, ...c }: MainColumnsProps) {
  return (
    <>
      <Columns {...c} fill={id + '-money'} stripe={id + '-stripe'} grey={grey} />
      {ghost && !grey && <Caps {...c} values={ghost} />}
    </>
  )
}
