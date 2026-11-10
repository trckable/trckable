// What sits in the chart's lane under the plot: the notes as small round marks. Each carries the
// x it sits at (`data-rv`), so a replay brings it in as the line reaches it.
import type { ChartIn } from './DayChart'

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
