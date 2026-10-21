// The bell's list and which of it has been read by this person: one store for the badge and the menu. It is read once after
// the first paint and again when the sites it asks about change, when /now answers, when a tab is shown after a minute away
// and when the menu opens or is about to (never more than once in a minute by the first three, and never in a hidden tab).
// The last list is kept in memory, so a bell that mounts again starts with it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Site } from '../../lib/api'
import { incidents } from '../../features/incidents/api'
import { mentionsApi } from '../../features/mentions/api'
import { answersApi } from '../../features/answers/api'
import { openExplore } from '../explore/open'
import { isShared } from '../../lib/me'
import { useV2Extras } from '../slots'
import { onNowAnswer } from '../../features/live/api'
import { visibleInterval } from '../../lib/visibleInterval'
import { useReadSet } from './readState'
import { arrange, fromIncidents, fromSetup, fromMentions, fromMilestones, fromAnswers, othersOf, withFeed, type Notice } from './notices'

/** The least time between two reads the bell starts by itself. */
export const GAP_MS = 60_000
/** The least time between two reads when the menu is opened. */
export const OPEN_GAP_MS = 5000

/** The week the bell looks back over, as the report's range (day keys in UTC). */
const answersRange = (now: number) => ({ from: new Date((now - 7 * 86400) * 1000).toISOString().slice(0, 10), to: new Date(now * 1000).toISOString().slice(0, 10) })

/** The last list read, for a bell that mounts again (as long as it is the same account: the same sites). */
let held: { key: string; own: Notice[] } | null = null
const keyOf = (sites: Site[]) => sites.map((s) => s.id).join(',')
// Before the sites are known (a page that has just mounted) the last list stands in for them.
const heldFor = (sites: Site[]) => (held && (sites.length === 0 || held.key === keyOf(sites)) ? held.own : null)

export function useNotices(site: Site | null, sites: Site[]) {
  const [own, setItems] = useState<Notice[]>(() => heldFor(sites) ?? [])
  const [loaded, setLoaded] = useState(() => !!heldFor(sites))
  const { bell: extra, bellMore } = useV2Extras()
  const items = useMemo(() => withFeed(own, extra), [own, extra])
  const can = !isShared()
  // The list is read again with every new fact about a site (its last visit moves all day); the bell is read again only when the sites it asks about change.
  const asked = useRef(sites)
  useEffect(() => {
    asked.current = sites
  })
  const sitesKey = sites.map((s) => `${s.id}:${s.domain}:${!!s.mentions}:${!!s.answers}:${!!s.last_event_at}`).join('|')
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
  const { read, mark: send, synced, sync: syncRead } = useReadSet(can)
  const run = useCallback(async () => {
    const { site, sites } = ctx.current
    const now = Math.floor(Date.now() / 1000)
    const domain = (id: string) => sites.find((s) => s.id === id)?.domain
    const parts = await Promise.all([
      Promise.resolve(fromSetup(sites, now)),
      incidents.account(7).then((r) => fromIncidents(r.incidents, domain, now), () => []),
      site ? api.milestones(site.id).then((r) => fromMilestones(r.milestones, site.domain), () => []) : Promise.resolve([]),
      site?.mentions ? mentionsApi.list(site.id, '7d').then((r) => fromMentions(r.mentions, site.domain), () => []) : Promise.resolve([]),
      site?.answers ? answersApi.report(site.id, answersRange(now), undefined).then((r) => fromAnswers(r, site.domain, now, () => openExplore('answers')), () => []) : Promise.resolve([]),
      // The account's other sites tell their milestones and mentions too, the first few of them.
      ...othersOf(sites, site).flatMap((o) => [
        api.milestones(o.id).then((r) => fromMilestones(r.milestones, o.domain), () => []),
        o.mentions ? mentionsApi.list(o.id, '7d').then((r) => fromMentions(r.mentions, o.domain), () => []) : Promise.resolve([]),
      ]),
    ])
    const list = arrange(parts.flat(), now)
    held = { key: keyOf(sites), own: list }
    if (alive.current) {
      setItems(list)
      setLoaded(true)
    }
  }, [])
  const again = useRef<(gap?: number) => void>(() => undefined)
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Reads the lists again unless a read is on its way; one that began less than `gap` ms ago puts it off to when the gap is over (once). A hidden tab reads nothing. */
  const refresh = useCallback(
    (gap = GAP_MS, soon = false) => {
      if (!can || document.visibilityState === 'hidden') return
      syncRead()
      if (flight.current) return
      const wait = last.current + gap - Date.now()
      if (wait > 0) {
        // The menu opening (or about to) wants the list as it is: a read that came a moment ago answers it, and a second one must not land while it is open.
        if (!soon && !later.current)
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
    [can, run, syncRead],
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
  }, [site?.id, site?.domain, site?.mentions, site?.answers, sitesKey, can, refresh])
  const mark = useCallback((id: string | string[]) => send(Array.isArray(id) ? id : [id]), [send])
  const markAll = useCallback(() => {
    bellMore?.readAll()
    send(items.map((i) => i.id))
  }, [send, items, bellMore])
  // Ready when the whole list can be drawn at once: the site's own rows, what the account has read and the build's own rows.
  const ready = loaded && synced && (bellMore?.ready ?? true)
  return { items, read, refresh, mark, markAll, can, ready, sites, dismiss: bellMore?.dismiss, archive: bellMore?.archive }
}
