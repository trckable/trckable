// The incident record, loaded when a screen asks: a period of one site (the
// chart's markers, the page's cards), the one still going on,
// and the account's for All sites. A failed read leaves the screen as it was:
// no markers, no list, never an error over a page that is otherwise fine.
import { useCallback, useEffect, useState } from 'react'
import { incidents, type Incident, type Summary } from './api'

type State<T> = { key: string; data: T | null; failed: boolean }

function useLoaded<T>(key: string, load: () => Promise<T>): { data: T | null; failed: boolean; ready: boolean; reload: () => void } {
  const [state, setState] = useState<State<T>>({ key: '', data: null, failed: false })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let current = true
    load().then(
      (data) => current && setState({ key, data, failed: false }),
      () => current && setState({ key, data: null, failed: true }),
    )
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key says what is loaded
  }, [key, round])
  return { data: state.key === key ? state.data : null, failed: state.key === key && state.failed, ready: state.key === key, reload: useCallback(() => setRound((n) => n + 1), []) }
}

/** The incidents that overlap [from, to] (unix seconds) of a site, with the period's totals. */
export function usePeriodIncidents(site: string, from: number, to: number, enabled = true) {
  const r = useLoaded<{ incidents: Incident[]; summary: Summary; quiet_tracked?: boolean }>(`${enabled}:${site}:${from}:${to}`, () => (enabled ? incidents.period(site, from, to) : Promise.reject(new Error('off'))))
  return { list: r.data?.incidents ?? [], summary: r.data?.summary ?? null, quietTracked: r.data?.quiet_tracked, ready: r.ready, failed: r.failed && enabled, reload: r.reload }
}

/** The account's incidents of the last `days` days, for All sites. */
export function useAccountIncidents(days: number) {
  const r = useLoaded<{ incidents: Incident[]; quiet_tracked?: Record<string, boolean>; paused?: Record<string, number> }>(`all:${days}`, () => incidents.account(days))
  return { list: r.data?.incidents ?? [], quiet: r.data?.quiet_tracked ?? {}, paused: r.data?.paused ?? {}, ready: r.ready, failed: r.failed }
}

/** The incident still going on at a site, if any (undefined until known), read again every half minute so the page's state is live. */
export function useOpenIncident(site: string): Incident | null | undefined {
  const [open, setOpen] = useState<{ site: string; x: Incident | null } | null>(null)
  useEffect(() => {
    let current = true
    const read = () =>
      incidents.page(site).then(
        (r) => current && setOpen({ site, x: r.incidents.find((x) => x.ended_at === null) ?? null }),
        () => undefined, // a failed read leaves the state as it was
      )
    void read()
    const timer = window.setInterval(() => void read(), 30_000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [site])
  return open?.site === site ? open.x : undefined
}

/** One moment (unix seconds) for a whole screen, so its figures agree with each other. */
export function useNow(): number {
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  return now
}

/** The clock (unix seconds), moved on every half minute: the state of the site on screen counts its time up while the page is open. */
export function useClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
