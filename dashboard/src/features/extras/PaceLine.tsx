// "→ ~9.4k this month", one quiet line in the Visitors tile: the visitors of
// this month's whole days so far, spread over the days of the month. Nothing
// before three whole days. Its tooltip says it in full. A chunk of its own.
import { useEffect, useState } from 'react'
import { cachedReport, type ReportQuery } from '../../lib/api'
import { fmtCompact } from '../../lib/format'
import { extrasCopy } from './copy'
import { monthSoFar, paceOf } from './pace'
import { whenQuiet } from './quiet'
import './pace.css'

export default function PaceLine({ site, today, filters, test }: { site: string; today: string; filters?: ReportQuery['filters']; test?: boolean }) {
  const span = monthSoFar(today)
  const key = [site, span?.from, span?.to, test ? 'test' : '', JSON.stringify(filters ?? [])].join('|')
  const [sum, setSum] = useState<{ key: string; visitors: number } | null>(null)
  useEffect(() => {
    if (!span) return
    let live = true
    // After the page is quiet: never a slot among the requests the first load needs.
    const cancel = whenQuiet(() => {
      cachedReport(site, { from: span.from, to: span.to, filters, bucket: 'day', testPayments: test })
        .then((r) => live && setSum({ key, visitors: r.current.kpis.visitors }))
        .catch(() => undefined)
    })
    return () => {
      live = false
      cancel()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  if (!span || !sum || sum.key !== key) return null
  const p = paceOf(sum.visitors, today)
  if (!p) return null
  const total = fmtCompact(p.total)
  return (
    <span className="kpi-pace num" title={extrasCopy.pace(total)}>
      {extrasCopy.paceShort(total)}
    </span>
  )
}
