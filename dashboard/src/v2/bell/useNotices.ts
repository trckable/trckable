// The bell's list, read once (and again every few minutes), and which of it has been read on this device.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { incidents } from '../../features/incidents/api'
import { mentionsApi } from '../../features/mentions/api'
import { isShared, isViewer } from '../../lib/me'
import { arrange, fromAlerts, fromIncidents, fromMentions, fromMilestones, unreadCount, type Notice } from './notices'

const KEY = 'trckable:bell:read'

const load = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
const save = (s: Set<string>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s].slice(-300)))
  } catch {
    /* a blocked store only forgets which were read */
  }
}

export function useNotices(site: Site, sites: Site[]) {
  const [items, setItems] = useState<Notice[]>([])
  const [read, setRead] = useState<Set<string>>(load)
  const can = !isShared()
  useEffect(() => {
    if (!can) return
    let live = true
    const run = async () => {
      const now = Math.floor(Date.now() / 1000)
      const domain = (id: string) => sites.find((s) => s.id === id)?.domain
      const parts = await Promise.all([
        incidents.account(7).then((r) => fromIncidents(r.incidents, domain, now), () => []),
        api.milestones(site.id).then((r) => fromMilestones(r.milestones, site.domain), () => []),
        site.mentions ? mentionsApi.list(site.id, '7d').then((r) => fromMentions(r.mentions, site.domain), () => []) : Promise.resolve([]),
        isViewer() ? Promise.resolve([]) : more.alerts(site.id).then((r) => fromAlerts(r.alerts, site.domain), () => []),
      ])
      if (live) setItems(arrange(parts.flat(), now))
    }
    void run()
    const t = setInterval(() => void run(), 5 * 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [site.id, site.domain, site.mentions, sites, can])
  const mark = useCallback((id: string) => {
    setRead((r) => {
      const n = new Set(r).add(id)
      save(n)
      return n
    })
  }, [])
  const markAll = useCallback(() => {
    setRead((r) => {
      const n = new Set(r)
      items.forEach((i) => n.add(i.id))
      save(n)
      return n
    })
  }, [items])
  const unread = useMemo(() => unreadCount(items, read), [items, read])
  return { items, read, unread, mark, markAll, can }
}
