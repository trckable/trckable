// What sits on the chart's own foot: the sales as pills (dots on a phone) and the notes as small flags. Each carries the
// x it sits at (`data-rv`), so a replay brings it in as the line reaches it.
import type { ChartIn } from './DayChart'

export function SaleMarks({ sales, ph, edge, B }: { sales: NonNullable<ChartIn['sales']>; ph: boolean; edge: (i: number) => number; B: number }) {
  return (
    <>
      {sales.slice(0, ph ? 12 : 10).map((x) => {
        const xx = edge(x.at)
        const col = x.neg ? 'var(--mk-red)' : 'var(--mk-lime)'
        if (ph) return <circle key={`${x.at}${x.text}`} data-rv={xx} cx={xx} cy={B - 5} r="3.5" fill={col} />
        const w = x.text.length * 7 + 14
        return (
          <g key={`${x.at}${x.text}`} data-rv={xx}>
            <line x1={xx} x2={xx} y1={B} y2={B - 30} stroke={col} strokeDasharray="2 3" />
            <rect x={xx - w / 2} y={B - 24} width={w} height="20" rx="10" fill={x.neg ? 'var(--mk-redP)' : 'var(--mk-limeP)'} stroke={col} />
            <text x={xx} y={B - 10} fill={col} fontSize="12" textAnchor="middle">
              {x.text}
            </text>
          </g>
        )
      })}
    </>
  )
}

export function NoteMarks({ notes, X, B }: { notes: ChartIn['notes']; X: (i: number) => number; B: number }) {
  return (
    <>
      {notes.map((n) => (
        <path key={`${n.i}${n.text}`} data-rv={X(n.i)} d={`M${X(n.i) - 6} ${B - 1}h12l-6-10z`} fill="var(--mk-amber)">
          <title>{n.text}</title>
        </path>
      ))}
    </>
  )
}

/** The leading buckets of a daily chart with nobody in them (the site had not begun): the index the data starts at, 0 when there is no such stretch. */
export function firstData(bucket: string, vals: number[]): number {
  const at = vals.findIndex((v) => v > 0)
  return bucket === 'day' && at >= 2 ? at : 0
}
