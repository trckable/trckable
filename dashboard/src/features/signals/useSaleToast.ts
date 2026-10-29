// Money on the stream: a coin toast over whatever view is open (Live included,
// which stays as it is) saying what it was, the browser notice instead while
// the tab is out of sight, and a chime for a sale arriving when the person
// asked for one.
import type { Sale } from '../../lib/api'
import { useMomentToast } from './useMomentToast'
import { arriving, saleLine } from './saleLine'

const tag = (s: Sale) => `sale-${s.ts}`

export function useSaleToast(sales: (Sale & { id: number })[]) {
  useMomentToast({ items: sales, line: saleLine, tag, loud: arriving })
}
