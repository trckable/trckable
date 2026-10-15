// Things arriving while you watch, drawn rising from today's point of the main
// chart: a visit, a goal, a sale. Only while the chart ends at now and is not
// showing a single past day: a dot rising from last Tuesday would be a lie.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pulse } from '../../charts/GuardedChart'
import type { Sale, Visit } from '../../lib/api'
import { fmtMoney } from '../../lib/format'

export function useLivePulses(stream: { visits: (Visit & { id: number })[]; sales: (Sale & { id: number })[] }, pulsing: boolean): Pulse[] {
  const [pulses, setPulses] = useState<Pulse[]>([])
  // Every timer is kept, so leaving the page (or the site) takes them with it.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }, [])
  useEffect(() => {
    const kept = timers.current
    return () => {
      kept.forEach(clearTimeout)
      kept.clear()
    }
  }, [])
  const addPulse = useCallback(
    (pl: Pulse) => {
      setPulses((ps) => [...ps.slice(-14), pl])
      later(() => setPulses((ps) => ps.filter((x) => x.id !== pl.id)), 2400)
    },
    [later],
  )
  // The stream starts empty and only ever carries what happens after the page
  // opened, so every visit it delivers is news; ids start at 1.
  const lastVisit = useRef(0)
  const lastSale = useRef(0)
  // Events are written in small batches, so several can reach the page in one
  // render. Each one gets its own pulse — up to a handful, staggered so a
  // burst reads as a burst — rather than only the newest.
  useEffect(() => {
    const fresh = stream.visits.filter((v) => v.id > lastVisit.current)
    if (!fresh.length) return
    lastVisit.current = fresh[0].id
    if (!pulsing) return
    fresh
      .slice(0, 6)
      .reverse()
      .forEach((v, i) => later(() => addPulse({ id: `v${v.id}`, kind: v.kind === 'goal' ? 'goal' : 'visit' }), i * 140))
  }, [stream.visits, pulsing, addPulse, later])
  useEffect(() => {
    const fresh = stream.sales.filter((x) => x.id > lastSale.current)
    if (!fresh.length) return
    lastSale.current = fresh[0].id
    if (!pulsing) return
    fresh
      .slice(0, 4)
      .reverse()
      .forEach((x, i) => later(() => addPulse({ id: `s${x.id}`, kind: 'sale', label: '+' + fmtMoney(x.amount, x.currency, x.exponent) }), i * 400))
  }, [stream.sales, pulsing, addPulse, later])
  return pulses
}
