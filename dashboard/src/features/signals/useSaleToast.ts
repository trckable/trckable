// Money on the stream: a coin toast over whatever view is open (Live included,
// which stays as it is) saying what it was, the browser notice instead while
// the tab is out of sight, and a chime for a sale arriving when the person
// asked for one.
import { useEffect, useRef } from 'react'
import { toast } from '../../components/Toast'
import type { Sale } from '../../lib/api'
import { chime } from './chime'
import { tell } from './notify'
import { pref } from './prefs'
import { arriving, saleLine } from './saleLine'

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
      .forEach((s) => {
        const line = saleLine(s)
        if (document.visibilityState === 'visible' && document.hasFocus()) toast(line, 'sale')
        else tell(line, '', `sale-${s.ts}`)
      })
    if (pref('sound') && fresh.some(arriving)) chime()
  }, [sales])
}
