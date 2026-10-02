// Things arriving while you watch, drawn rising from today's point of the main
// chart: a visit, a goal, a sale. Only while the chart ends at now and is not
// showing a single past day: a dot rising from last Tuesday would be a lie.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pulse } from '../../charts/GuardedChart'
import type { Sale, Visit } from '../../lib/api'
import { fmtMoney } from '../../lib/format'

export function useLivePulses(stream: { visits: (Visit & { id: number })[]; sales: (Sale & { id: number })[] }, pulsing: boolean): Pulse[] {
  const [pulses, setPulses] = useState<Pulse[]>([])
  const addPulse = useCallback((pl: Pulse) => {
    setPulses((ps) => [...ps.slice(-14), pl])
    setTimeout(() => setPulses((ps) => ps.filter((x) => x.id !== pl.id)), 2400)
  }, [])
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
      .forEach((v, i) => setTimeout(() => addPulse({ id: `v${v.id}`, kind: v.kind === 'goal' ? 'goal' : 'visit' }), i * 140))
  }, [stream.visits, pulsing, addPulse])
  useEffect(() => {
    const fresh = stream.sales.filter((x) => x.id > lastSale.current)
    if (!fresh.length) return
    lastSale.current = fresh[0].id
    if (!pulsing) return
    fresh
      .slice(0, 4)
      .reverse()
      .forEach((x, i) => setTimeout(() => addPulse({ id: `s${x.id}`, kind: 'sale', label: '+' + fmtMoney(x.amount, x.currency, x.exponent) }), i * 400))
  }, [stream.sales, pulsing, addPulse])
  return pulses
}
