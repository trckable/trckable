// "On pace for ~9,400 this month", one quiet line in the chart's head: the
// visitors (or the revenue) of this month's whole days so far, spread over the
// days of the month. Nothing before three whole days, and nothing for a metric
// that does not add up (a rate). A chunk of its own.
import { useEffect, useState } from 'react'
import { cachedReport, type ReportQuery } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { extrasCopy } from './copy'
import { monthSoFar, paceOf } from './pace'
import './pace.css'

export default function PaceLine({ site, today, filters, metric, money }: { site: string; today: string; filters?: ReportQuery['filters']; metric: string; money?: (minor: number) => string }) {
  const span = monthSoFar(today)
  const key = [site, span?.from, span?.to, JSON.stringify(filters ?? [])].join('|')
  const [sum, setSum] = useState<{ key: string; visitors: number; revenue: number } | null>(null)
  useEffect(() => {
    if (!span) return
    let live = true
    cachedReport(site, { from: span.from, to: span.to, filters, bucket: 'day' })
      .then((r) => live && setSum({ key, visitors: r.current.kpis.visitors, revenue: r.current.money?.revenue ?? 0 }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  if (!span || !sum || sum.key !== key || (metric !== 'visitors' && metric !== 'revenue')) return null
  const p = paceOf(metric === 'revenue' ? sum.revenue : sum.visitors, today)
  if (!p) return null
  return <span className="faint pace-line">{extrasCopy.pace(metric === 'revenue' && money ? money(p.total) : fmtInt(p.total))}</span>
}
