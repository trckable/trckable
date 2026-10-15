// The one line under a chart's headline that says where the period's biggest
// jump came from: "Most of the Oct 2 jump came from Hacker News (+40)". Only
// when a known source explains most of a day's rise; otherwise nothing at all.
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import { biggest } from './model'
import { useJumps } from './useJumps'

export default function BiggestLine(p: { site: string; from: string; to: string; labels: string[]; visitors: number[]; className?: string }) {
  const { sources } = useJumps(p.site, p.from, p.to)
  const j = biggest(sources, p.labels, p.visitors)
  if (!j) return null
  return <p className={p.className ?? 'sm-line'}>{copy.line(fmtDay(j.day), j.name, j.added)}</p>
}
