// The bell's list, read once (and again every few minutes), and which of it has been read by this person.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { incidents } from '../../features/incidents/api'
import { mentionsApi } from '../../features/mentions/api'
import { isShared, isViewer } from '../../lib/me'
import { useV2Extras } from '../slots'
import { visibleInterval } from '../../lib/visibleInterval'
import { loadLocal, saveLocal, syncRead } from './readState'
import { arrange, fromAlerts, fromIncidents, fromMentions, fromMilestones, unreadCount, type Notice } from './notices'

export function useNotices(site: Site | null, sites: Site[]) {
  const [own, setItems] = useState<Notice[]>([])
  const extra = useV2Extras().bell
  const items = useMemo(() => (extra?.length ? [...own, ...extra.filter((e) => !own.some((o) => o.id === e.id))].sort((a, b) => b.at - a.at).slice(0, 40) : own), [own, extra])
  const [read, setRead] = useState<Set<string>>(loadLocal)
  const can = !isShared()
  useEffect(() => {
    if (!can) return
    let live = true
    const run = async () => {
      const now = Math.floor(Date.now() / 1000)
      const domain = (id: string) => sites.find((s) => s.id === id)?.domain
      const parts = await Promise.all([
        incidents.account(7).then((r) => fromIncidents(r.incidents, domain, now), () => []),
        site ? api.milestones(site.id).then((r) => fromMilestones(r.milestones, site.domain), () => []) : Promise.resolve([]),
        site?.mentions ? mentionsApi.list(site.id, '7d').then((r) => fromMentions(r.mentions, site.domain), () => []) : Promise.resolve([]),
        isViewer() || !site ? Promise.resolve([]) : more.alerts(site.id).then((r) => fromAlerts(r.alerts, site.domain), () => []),
      ])
      if (live) setItems(arrange(parts.flat(), now))
    }
    // After the first paint has had its reads: the bell is not what the page is waiting for.
    const first = setTimeout(() => void run(), 3000)
    const stop = visibleInterval(() => void run(), 5 * 60_000, false)
    return () => {
      live = false
      clearTimeout(first)
      stop()
    }
  }, [site?.id, site?.domain, site?.mentions, sites, can]) // eslint-disable-line react-hooks/exhaustive-deps -- the site's own fields say when it changed
  // The server keeps the account's read list; this browser's copy is what shows when it cannot be reached, and
  // what it holds that the server lacks (read offline, or before this existed) is sent up.
  useEffect(() => {
    if (!can) return
    let live = true
    void syncRead(loadLocal()).then((all) => {
      if (!live || !all) return
      saveLocal(all)
      setRead(all)
    })
    return () => {
      live = false
    }
  }, [can])
  const mark = useCallback((id: string) => {
    setRead((r) => {
      if (r.has(id)) return r
      const n = new Set(r).add(id)
      saveLocal(n)
      void more.markBellRead([id]).catch(() => undefined)
      return n
    })
  }, [])
  const markAll = useCallback(() => {
    setRead((r) => {
      const fresh = items.filter((i) => !r.has(i.id)).map((i) => i.id)
      if (!fresh.length) return r
      const n = new Set([...r, ...fresh])
      saveLocal(n)
      void more.markBellRead(fresh).catch(() => undefined)
      return n
    })
  }, [items])
  const unread = useMemo(() => unreadCount(items, read), [items, read])
  return { items, read, unread, mark, markAll, can }
}
