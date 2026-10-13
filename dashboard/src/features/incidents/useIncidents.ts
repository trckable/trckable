// The incident record, loaded when a screen asks: a period of one site (the
// chart's markers, the page's cards), a site's whole list a page at a time,
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
  const r = useLoaded<{ incidents: Incident[]; summary: Summary }>(`${enabled}:${site}:${from}:${to}`, () => (enabled ? incidents.period(site, from, to) : Promise.reject(new Error('off'))))
  return { list: r.data?.incidents ?? [], summary: r.data?.summary ?? null, ready: r.ready, failed: r.failed && enabled, reload: r.reload }
}

/** The account's incidents of the last `days` days, for All sites. */
export function useAccountIncidents(days: number) {
  const r = useLoaded<Incident[]>(`all:${days}`, () => incidents.account(days).then((x) => x.incidents))
  return { list: r.data ?? [], ready: r.ready, failed: r.failed }
}

/** A site's list, newest first, fifty at a time. */
export function useIncidentList(site: string) {
  const [pages, setPages] = useState<{ site: string; list: Incident[]; next: number | null; failed: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const first = pages?.site === site ? pages : null
  useEffect(() => {
    let current = true
    incidents.page(site).then(
      (r) => current && setPages({ site, list: r.incidents, next: r.next_before, failed: false }),
      () => current && setPages({ site, list: [], next: null, failed: true }),
    )
    return () => {
      current = false
    }
  }, [site])
  const more = () => {
    if (!first?.next || busy) return
    setBusy(true)
    incidents.page(site, first.next).then(
      (r) => setPages({ site, list: [...first.list, ...r.incidents], next: r.next_before, failed: false }),
      () => setPages({ ...first, failed: true }),
    ).finally(() => setBusy(false))
  }
  const edit = (x: Incident) => setPages((p) => (p ? { ...p, list: p.list.map((y) => (y.id === x.id ? x : y)) } : p))
  return { list: first?.list ?? [], next: first?.next ?? null, ready: !!first, failed: !!first?.failed, busy, more, edit }
}

/** One moment (unix seconds) for a whole screen, so its figures agree with each other. */
export function useNow(): number {
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  return now
}
