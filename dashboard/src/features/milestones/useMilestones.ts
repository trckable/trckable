// A site's milestones for the dashboard: the one moment to show, the dot on
// the menu for what is new in the timeline, and which dialog is open. Never
// on a shared link. Closing the moment closes everything new for this
// person (the server keeps who saw what); the rest waits in the timeline.
import { useCallback, useEffect, useState } from 'react'
import { api, type Milestone, type Milestones, type Site } from '../../lib/api'
import { isShared } from '../../lib/me'
import { hasDot, keyOf } from './words'

const opened = (site: string) => 'tkb_ms_open_' + site

function lastOpened(site: string): number {
  try {
    return Number(localStorage.getItem(opened(site))) || 0
  } catch {
    return 0 // private window: the dot shows until the list is opened
  }
}

export type Open = { list: true } | { share: Milestone } | null

export function useMilestones(site: Site) {
  const [data, setData] = useState<Milestones | null>(null)
  const [moment, setMoment] = useState<Milestone | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [seenAt, setSeenAt] = useState(() => lastOpened(site.id))
  const load = useCallback(() => {
    if (isShared()) return
    api
      .milestones(site.id)
      .then((r) => {
        setData(r)
        setMoment(r.enabled ? r.moment : null)
      })
      .catch(() => {})
  }, [site.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- another site: its own milestones load below, the old ones must not linger
    setData(null)
    setMoment(null)
    setSeenAt(lastOpened(site.id))
    load()
  }, [load, site.id])
  const close = () => {
    if (!moment || !data) return
    setMoment(null)
    const keys = data.milestones.filter((m) => m.new).map(keyOf)
    api.closeMilestones(site.id, keys).catch(() => {})
  }
  const openList = () => {
    const now = Math.floor(Date.now() / 1000)
    try {
      localStorage.setItem(opened(site.id), String(now))
    } catch {
      /* private window */
    }
    setSeenAt(now)
    setOpen({ list: true })
  }
  const on = !!data?.enabled
  const dot = on && hasDot(data.milestones, seenAt, moment)
  return { data, moment, close, open, setOpen, openList, on, dot, reload: load }
}

export type MilestonesState = ReturnType<typeof useMilestones>
