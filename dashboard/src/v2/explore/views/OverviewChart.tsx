// The chart over Overview: the same one What changed draws (people, the outcome's bars and faces, the period before),
// for the page's own site, period and filters. Without the moments and notes, which belong to What changed.
import { useState } from 'react'
import type { Report } from '../../../lib/api'
import { isShared } from '../../../lib/me'
import { useBriefingChart } from '../../briefing/useBriefingChart'
import { HeroChart } from '../../ui/DayChart'
import type { XCtx } from '../ctx'

export default function OverviewChart({ x, report }: { x: XCtx; report: Report }) {
  const [at, setAt] = useState<number | null>(null)
  const { view, site, query } = x
  const ask = { ...query }
  delete ask.limit
  const b = useBriefingChart({ site, report, period: view.period, compare: view.compare, range: { from: query.from, to: query.to }, bucket: view.bucket, ask, notes: [], money: x.money, on: true, plain: x.filters.length > 0 || isShared() })
  if (!b || !b.ready) return null
  return (
    <div className="chplot">
      <HeroChart c={b.chart} at={at} onAt={setAt} />
    </div>
  )
}
