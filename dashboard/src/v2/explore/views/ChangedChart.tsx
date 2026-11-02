// The chart over What changed: the line of words, the busy-moment band, the moments' markers, the mentions and the
// note flags, for the page's own site and period. Its own chunk, drawn after the numbers.
import { useState } from 'react'
import type { Report } from '../../../lib/api'
import { ChartBlock } from '../../briefing/ChartBlock'
import { useBriefingChart } from '../../briefing/useBriefingChart'
import { chartLine } from '../../briefing/lines'
import { chartNote, chartTone } from '../../ui/chartNote'
import type { XCtx } from '../ctx'

export default function ChangedChart({ x, report, notes, onNotes }: { x: XCtx; report: Report; notes: { day: string; text: string }[]; onNotes: () => void }) {
  const [at, setAt] = useState<number | null>(null)
  const { view, site, query } = x
  const ask = { ...query }
  delete ask.limit
  const b = useBriefingChart({ site, report, period: view.period, compare: view.compare, range: { from: query.from, to: query.to }, bucket: view.bucket, ask, notes, money: x.money, on: true })
  if (!b || !b.ready) return null
  const { chart } = b
  const down = !!site.down_since
  return (
    <ChartBlock
      site={site}
      range={{ from: query.from, to: query.to }}
      chart={chart}
      at={at}
      onAt={setAt}
      series={b.series}
      bucket={b.bucket}
      money={x.money}
      record={b.record}
      note={chartLine(b.learning, b.low, b.hd, () => chartNote(chart, at, down))}
      tone={b.learning || b.low ? undefined : chartTone(chart, at, down)}
      down={b.down}
      notes={notes.length}
      onNotes={onNotes}
    />
  )
}
