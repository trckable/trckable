// Weekday × hour, from the rhythm module's own endpoint (the same numbers
// the old Weekly rhythm card showed, now with a key and a table).
import { useEffect, useState } from 'react'
import { ChartCard } from '../../../charts/ChartCard'
import { HeatGrid, HeatKey } from '../../../charts/HeatGrid'
import { api, type Heatmap, type ReportQuery } from '../../../lib/api'
import { copy } from '../copy'
import { rhythmModel } from '../model'

const HOURS = Array.from({ length: 24 }, (_, h) => copy.rhythm.hour(h))

export function RhythmCard({ site, query, timezone }: { site: string; query: ReportQuery; timezone: string }) {
  const [data, setData] = useState<{ key: string; h: Heatmap } | null>(null)
  const [failed, setFailed] = useState(false)
  const key = site + JSON.stringify([query.from, query.to, query.filters])
  useEffect(() => {
    let live = true
    api
      .heatmap(site, query)
      .then((h) => live && setData({ key, h }))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object each render
  if (failed) return null
  const h = data?.h
  return (
    <ChartCard
      id="rhythm"
      wide
      title={copy.rhythm.title}
      question={copy.rhythm.question}
      loading={!h}
      empty={!!h && h.total === 0}
      table={h ? rhythmModel(h).table : { caption: '', columns: [], rows: [] }}
      headKey={<HeatKey color="var(--accent)" fewer={copy.rhythm.fewer} more={copy.rhythm.more} />}
    >
      {h && (
        <HeatGrid
          cells={h.cells}
          rows={copy.rhythm.days}
          cols={HOURS}
          colTicks={[0, 6, 12, 18, 23]}
          color="var(--accent)"
          label={copy.rhythm.label(timezone)}
          tip={(r, c, n) => copy.rhythm.tip(copy.rhythm.days[r], c, n)}
        />
      )}
    </ChartCard>
  )
}
