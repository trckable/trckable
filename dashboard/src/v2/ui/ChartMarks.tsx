// What sits in the chart's lane under the plot: the sales and the notes as small round marks. Each carries the
// x it sits at (`data-rv`), so a replay brings it in as the line reaches it.
import type { ChartIn } from './DayChart'

export function SaleMarks({ sales, edge, cy }: { sales: NonNullable<ChartIn['sales']>; edge: (i: number) => number; cy: number }) {
  return (
    <>
      {sales.slice(0, 10).map((x) => {
        const xx = edge(x.at)
        const col = x.neg ? 'var(--mk-red)' : 'var(--mk-lime)'
        return (
          <circle key={`${x.at}${x.text}`} data-rv={xx} cx={xx} cy={cy} r="7" fill={x.neg ? 'var(--mk-redP)' : 'var(--mk-limeP)'} stroke={col}>
            <title>{x.text}</title>
          </circle>
        )
      })}
    </>
  )
}

export function NoteMarks({ notes, X, cy }: { notes: ChartIn['notes']; X: (i: number) => number; cy: number }) {
  return (
    <>
      {notes.map((n) => (
        <g key={`${n.i}${n.text}`} data-rv={X(n.i)}>
          <circle cx={X(n.i)} cy={cy} r="7" fill="var(--mk-amber)" fillOpacity=".22" stroke="var(--mk-amber)" />
          <circle cx={X(n.i)} cy={cy} r="2" fill="var(--mk-amber)" />
          <title>{n.text}</title>
        </g>
      ))}
    </>
  )
}

/** The leading buckets of a daily chart with nobody in them (the site had not begun): the index the data starts at, 0 when there is no such stretch. */
export function firstData(bucket: string, vals: number[]): number {
  const at = vals.findIndex((v) => v > 0)
  return bucket === 'day' && at >= 2 ? at : 0
}
