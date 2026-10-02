// The weekly email's switch on the first screen. Where it goes is already
// decided: the site's own alerts' destination (a new site has the weekly report
// and "tracking stopped" on from the start, to the owner's email), else the
// owner's email when the server can send mail. With neither there is nothing to
// send to, and the switch opens Alerts instead of saying yes to nothing.
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { api, fail, type Alert, type Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { first } from './firstCopy'
import { destination } from './weeklyTarget'

export interface WeeklyEmail {
  /** Loaded: nothing is drawn before the server has answered. */
  ready: boolean
  on: boolean
  /** There is somewhere to send it: the switch can be turned on from here. */
  deliverable: boolean
  busy: boolean
  toggle: () => void
}

export function useWeeklyEmail(site: Site): WeeklyEmail {
  const [list, setList] = useState<Alert[] | null>(null)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    Promise.all([api.alerts(site.id), api.me().catch(() => null)])
      .then(([r, me]) => {
        if (!live) return
        setList(r.alerts)
        setTarget(destination(r.alerts, !!r.mail, me?.email ?? ''))
      })
      .catch(() => live && setList(null))
    return () => {
      live = false
    }
  }, [site.id])

  const weekly = list?.find((a) => a.kind === 'weekly')
  const on = !!weekly?.enabled
  const toggle = () => {
    if (!target) {
      openSettings(site, 'alerts')
      return
    }
    setBusy(true)
    api
      .saveAlert(site.id, { id: weekly?.id, kind: 'weekly', enabled: !on, target, threshold: weekly?.threshold ?? 0 })
      .then((a) => {
        setList((l) => [...(l ?? []).filter((x) => x.kind !== 'weekly'), a])
        toast(on ? first.weeklyStopped : first.weeklyOn)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return { ready: list !== null, on, deliverable: !!target, busy, toggle }
}
