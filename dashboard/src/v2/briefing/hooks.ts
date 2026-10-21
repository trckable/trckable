// What the Briefing reads besides the report: the server's "usual" for a day, the incident record over the period, and
// what is not set up yet. Each is asked once and never blocks the page.
import { useEffect, useState } from 'react'
import { api, call, rangeQS, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import type { Range } from '../../lib/dates'
import { startOfDay, uptimeOf } from '../../features/incidents/model'
import { useNow, usePeriodIncidents } from '../../features/incidents/useIncidents'
import { isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { useWanted } from '../setup/useWanted'
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
  const up = summary && ready ? uptimeOf(to - from, lost, undefined, summary.paused) : null
  return { pct: up?.pct ?? null, lost, list, from0 }
}

/** What each part of the site's own setup is, for the quiet rows. */
export function useSetup(site: Site) {
  const [alerts, setAlerts] = useState(false)
  const [search, setSearch] = useState(false)
  const allowed = !isShared() && can('note.write')
  const want = useWanted(site.id, allowed)
  useEffect(() => {
    if (!allowed) return
    let live = true
    more.alerts(site.id).then((r) => live && setAlerts(r.alerts.length === 0), () => undefined)
    more.searchConsole(site.id).then((r) => live && setSearch(!r.connected), () => undefined)
    return () => {
      live = false
    }
  }, [site.id, allowed])
  // The rows come together once the checklist is read (none before), so a row never lands among rows already shown.
  return { can: allowed, noAlerts: alerts, noSearch: search, want: (kind: string) => want.known && want(kind) }
}

/** The people seen today since the hour the day is taken to start for someone looking in: one count of people, never a sum of hours. */
export function useSinceCount(site: string, today: string, hour: number, on: boolean): number | null {
  const [got, setGot] = useState<{ key: string; n: number } | null>(null)
  const key = `${site}|${today}|${hour}`
  useEffect(() => {
    if (!on) return
    let live = true
    api.report(site, { from: today, to: today, sincehour: hour }).then(
      (r) => live && setGot({ key, n: r.current.kpis.visitors }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [key, site, today, hour, on])
  return got && got.key === key ? got.n : null
}
