// The bell's list, read once (and again every few minutes), and which of it has been read by this person.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Site } from '../../lib/api'
import { incidents } from '../../features/incidents/api'
import { mentionsApi } from '../../features/mentions/api'
import { isShared } from '../../lib/me'
import { useV2Extras } from '../slots'
import { visibleInterval } from '../../lib/visibleInterval'
import { useReadSet } from './readState'
import { arrange, fromIncidents, fromMentions, fromMilestones, unreadCount, withFeed, type Notice } from './notices'

export function useNotices(site: Site | null, sites: Site[]) {
  const [own, setItems] = useState<Notice[]>([])
  const [ready, setReady] = useState(false)
  const extra = useV2Extras().bell
  const items = useMemo(() => withFeed(own, extra), [own, extra])
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
      ])
      if (live) {
        setItems(arrange(parts.flat(), now))
        setReady(true)
      }
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
  const { read, mark: send } = useReadSet(can)
  const mark = useCallback((id: string) => send([id]), [send])
  const markAll = useCallback(() => send(items.map((i) => i.id)), [send, items])
  const unread = useMemo(() => unreadCount(items, read), [items, read])
  return { items, read, unread, mark, markAll, can, ready }
}
