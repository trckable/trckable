// What the Briefing reads besides the report: the server's "usual" for a day, the incident record over the period, and
// what is not set up yet. Each is asked once and never blocks the page.
import { useEffect, useState } from 'react'
import { call, rangeQS, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import type { Range } from '../../lib/dates'
import { startOfDay, uptimeOf } from '../../features/incidents/model'
import { useNow, usePeriodIncidents } from '../../features/incidents/useIncidents'
import { isShared, isViewer } from '../../lib/me'
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
  const lost = summary?.seconds ?? 0
  const up = summary && ready ? uptimeOf(to - from, lost) : null
  return { pct: up?.pct ?? null, lost, list, from0 }
}

/** What each part of the site's own setup is, for the quiet rows. */
export function useSetup(site: Site) {
  const [alerts, setAlerts] = useState(false)
  const [search, setSearch] = useState(false)
  const can = !isShared() && !isViewer()
  useEffect(() => {
    if (!can) return
    let live = true
    more.alerts(site.id).then((r) => live && setAlerts(r.alerts.length === 0), () => undefined)
    more.searchConsole(site.id).then((r) => live && setSearch(!r.connected), () => undefined)
    return () => {
      live = false
    }
  }, [site.id, can])
  return { can, noAlerts: alerts, noSearch: search }
}
