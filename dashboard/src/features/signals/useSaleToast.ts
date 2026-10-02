// A sale arriving on the stream: a coin toast over whatever view is open (Live
// included, which stays as it is), and a chime when the person asked for one.
import { useEffect, useRef } from 'react'
import { toast } from '../../components/Toast'
import type { Sale } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { chime } from './chime'
import { signals } from './copy'
import { pref } from './prefs'

/** At most this many toasts for one burst of sales: the rest are in the numbers. */
const BURST = 3

export function useSaleToast(sales: (Sale & { id: number })[]) {
  const last = useRef(0)
  useEffect(() => {
    const fresh = sales.filter((s) => s.id > last.current)
    if (!fresh.length) return
    last.current = fresh[0].id
    fresh
      .slice(0, BURST)
      .reverse()
      .forEach((s) => toast(signals.sale('+' + fmtMoney(s.amount, s.currency, s.exponent)), 'sale'))
    if (pref('sound')) chime()
  }, [sales])
}
