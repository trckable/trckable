// The bell's list and which of it has been read by this person: one store for the badge and the menu. It is read once after
// the first paint and again when the sites it asks about change, when /now answers, when a tab is shown after a minute away
// and when the menu opens (never more than once in a minute by the first three, and never in a hidden tab).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Site } from '../../lib/api'
import { incidents } from '../../features/incidents/api'
import { mentionsApi } from '../../features/mentions/api'
import { isShared } from '../../lib/me'
import { useV2Extras } from '../slots'
import { onNowAnswer } from '../../features/live/api'
import { visibleInterval } from '../../lib/visibleInterval'
import { useReadSet } from './readState'
import { arrange, fromIncidents, fromSetup, fromMentions, fromMilestones, othersOf, withFeed, type Notice } from './notices'

/** The least time between two reads the bell starts by itself. */
export const GAP_MS = 60_000
/** The least time between two reads when the menu is opened. */
export const OPEN_GAP_MS = 5000

export function useNotices(site: Site | null, sites: Site[]) {
  const [own, setItems] = useState<Notice[]>([])
  const [ready, setReady] = useState(false)
  const { bell: extra, bellMore } = useV2Extras()
  const items = useMemo(() => withFeed(own, extra), [own, extra])
  const can = !isShared()
  // The list is read again with every new fact about a site (its last visit moves all day); the bell is read again only when the sites it asks about change.
  const asked = useRef(sites)
  useEffect(() => {
    asked.current = sites
  })
  const sitesKey = sites.map((s) => `${s.id}:${s.domain}:${!!s.mentions}:${!!s.last_event_at}`).join('|')
  const ctx = useRef({ site, sites })
  const last = useRef(0)
  const flight = useRef<Promise<void> | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    ctx.current = { site, sites }
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const bellRefresh = bellMore?.refresh
  const refreshExtra = useRef(bellRefresh)
  useEffect(() => {
    refreshExtra.current = bellRefresh
  })
  const run = useCallback(async () => {
    const { site, sites } = ctx.current
    const now = Math.floor(Date.now() / 1000)
    const domain = (id: string) => sites.find((s) => s.id === id)?.domain
    const parts = await Promise.all([
      Promise.resolve(fromSetup(sites, now)),
      incidents.account(7).then((r) => fromIncidents(r.incidents, domain, now), () => []),
      site ? api.milestones(site.id).then((r) => fromMilestones(r.milestones, site.domain), () => []) : Promise.resolve([]),
      site?.mentions ? mentionsApi.list(site.id, '7d').then((r) => fromMentions(r.mentions, site.domain), () => []) : Promise.resolve([]),
      // The account's other sites tell their milestones and mentions too, the first few of them.
      ...othersOf(sites, site).flatMap((o) => [
        api.milestones(o.id).then((r) => fromMilestones(r.milestones, o.domain), () => []),
        o.mentions ? mentionsApi.list(o.id, '7d').then((r) => fromMentions(r.mentions, o.domain), () => []) : Promise.resolve([]),
      ]),
    ])
    if (alive.current) {
      setItems(arrange(parts.flat(), now))
      setReady(true)
    }
  }, [])
  const again = useRef<(gap?: number) => void>(() => undefined)
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Reads the lists again unless a read is on its way; one that began less than `gap` ms ago puts it off to when the gap is over (once). A hidden tab reads nothing. */
  const refresh = useCallback(
    (gap = GAP_MS) => {
      if (!can || document.visibilityState === 'hidden' || flight.current) return
      const wait = last.current + gap - Date.now()
      if (wait > 0) {
        if (!later.current)
          later.current = setTimeout(() => {
            later.current = undefined
            again.current(gap)
          }, wait)
        return
      }
      last.current = Date.now()
      refreshExtra.current?.()
      flight.current = run().finally(() => {
        flight.current = null
      })
    },
    [can, run],
  )
  useEffect(() => {
    again.current = refresh
  })
  useEffect(() => () => clearTimeout(later.current), [])
  // The sites it asks about changed (or this is the first read, after the first paint has had its reads: the bell is not what the page is waiting for).
  useEffect(() => {
    if (!can) return
    let started = false
    const first = setTimeout(() => {
      started = true
      refresh()
    }, 3000)
    // A slow backstop for a page that has neither a /now nor a change of sites to go by.
    const stop = visibleInterval(() => refresh(), 5 * 60_000, false)
    // /now answering is the dashboard's pulse; a tab shown after a minute away looks at once.
    const pulse = onNowAnswer(() => started && refresh())
    let hiddenAt = 0
    const shown = () => {
      if (document.visibilityState === 'hidden') hiddenAt ||= Date.now()
      else {
        const away = hiddenAt ? Date.now() - hiddenAt : 0
        hiddenAt = 0
        if (away > GAP_MS) refresh(0)
      }
    }
    document.addEventListener('visibilitychange', shown)
    return () => {
      clearTimeout(first)
      stop()
      pulse()
      document.removeEventListener('visibilitychange', shown)
    }
  }, [site?.id, site?.domain, site?.mentions, sitesKey, can, refresh])
  const { read, mark: send } = useReadSet(can)
  const mark = useCallback((id: string) => send([id]), [send])
  const markAll = useCallback(() => {
    bellMore?.readAll()
    send(items.map((i) => i.id))
  }, [send, items, bellMore])
  return { items, read, refresh, mark, markAll, can, ready, dismiss: bellMore?.dismiss, archive: bellMore?.archive }
}
