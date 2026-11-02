// What the chart reads besides the report: the server's "usual" for a day and the incident record over the period. Each
// is asked once and never blocks the page.
import { useEffect, useState } from 'react'
import { call, rangeQS, type Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { startOfDay, uptimeOf } from '../../features/incidents/model'
import { useNow, usePeriodIncidents } from '../../features/incidents/useIncidents'
import { isShared } from '../../lib/me'
import { downSeconds } from './outage'
import type { Usual } from './model'

/** What the server calls usual for the day (the same weekday, up to the same time), for today and yesterday. */
export function useUsual(site: string, day: string, on: boolean): Usual | null {
  const [got, setGot] = useState<{ key: string; usual: Usual } | null>(null)
  const key = `${site}|${day}`
  useEffect(() => {
    if (!on) return
    let live = true
    call<Usual>('GET', `/sites/${encodeURIComponent(site)}/usual` + rangeQS({ from: day, to: day }), undefined, undefined, true).then(
      (usual) => live && setGot({ key, usual }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [key, site, day, on])
  return got && got.key === key ? got.usual : null
}

/** The incident record over the period, said as the scores, the chart and the cards need it. */
export function useUptime(site: Site, range: Range) {
  const now = useNow()
  const from0 = startOfDay(range.from, site.timezone)
  const to = Math.min(startOfDay(range.to, site.timezone) + 86400, now)
  const from = Math.min(Math.max(from0, site.watched_since ?? 0), to)
  const { summary, list, ready } = usePeriodIncidents(site.id, from, to, !isShared())
  // Minutes down are counted from the incidents, the part of each inside the period, so every figure on the page agrees.
  const lost = ready && list ? downSeconds(list, from0, to, now) : summary?.seconds ?? 0
  const up = summary && ready ? uptimeOf(to - from, lost, undefined, summary.paused) : null
  return { pct: up?.pct ?? null, lost, list, from0, from, to }
}
