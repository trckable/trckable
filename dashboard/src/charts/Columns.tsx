// Revenue as columns: rounded tops, the money colour lit from the top, a soft
// glow. A day with no sales draws nothing, the one still counting is striped,
// and the hovered day is drawn in full with the others a little softer.
import { columnHeight, columnPath } from './moneyPlot'

interface ColumnsProps {
  values: number[]
  x: (i: number) => number
  /** The baseline, and the height a full column reaches. */
  base: number
  h: number
  /** The value that reaches the top. */
  max: number
  w: number
  hover: number | null
  /** The last column is still filling: striped. */
  partialLast?: boolean
  /** Ids of the fill and the stripe (TimeDefs). */
  fill: string
  stripe: string
  /** A quiet grey copy, for what Replay has not reached. */
  grey?: boolean
}

export function Columns(p: ColumnsProps) {
  const last = p.values.length - 1
  return (
    <g aria-hidden="true">
      {p.values.map((v, i) => {
        if (!(v > 0)) return null
        const d = columnPath(p.x(i), p.base, columnHeight(v, p.max, p.h), p.w)
        if (p.grey) return <path key={i} d={d} fill="var(--text-4)" fillOpacity="0.35" />
        const striped = p.partialLast && i === last
        return <path key={i} className="money-col" d={d} fill={`url(#${striped ? p.stripe : p.fill})`} fillOpacity={p.hover == null || p.hover === i ? 1 : 0.62} />
      })}
    </g>
  )
}

/** Last period, over columns: a dashed cap on each day at the height it reached then. */
export function Caps({ values, x, base, h, max, w }: { values: number[]; x: (i: number) => number; base: number; h: number; max: number; w: number }) {
  return (
    <g aria-hidden="true">
      {values.map((v, i) => {
        if (!(v > 0)) return null
        const y = base - columnHeight(v, max, h)
        return <line key={i} x1={x(i) - w / 2 - 2} x2={x(i) + w / 2 + 2} y1={y} y2={y} stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="3 2" />
      })}
    </g>
  )
}
