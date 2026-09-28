// Today's revenue, the Data view's Revenue tile for Today. A sale on the
// stream lights a short line under it for a few seconds.
import { useEffect, useRef, useState } from 'react'
import type { Sale } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { useTween } from '../../lib/motion'
import { copy } from './copy'
import type { LiveNow } from './api'

const SHOW_MS = 6000

export function RevenueToday({ revenue, sales }: { revenue: NonNullable<LiveNow['revenue']>; sales: (Sale & { id: number })[] }) {
  const v = useTween(revenue.amount, 700)
  const fmt = (minor: number) => fmtMoney(minor, revenue.currency, revenue.exponent)
  // Only sales that arrive while Live is open, not the ones before it.
  const seen = useRef(sales[0]?.id ?? 0)
  const [sold, setSold] = useState<(Sale & { id: number }) | null>(null)
  const newest = sales[0]
  useEffect(() => {
    if (!newest || newest.id <= seen.current) return
    seen.current = newest.id
    setSold(newest)
  }, [newest])
  useEffect(() => {
    if (!sold) return
    const t = setTimeout(() => setSold(null), SHOW_MS)
    return () => clearTimeout(t)
  }, [sold])
  return (
    <div className="live-revenue">
      <h3 className="live-label">{copy.revenueToday}</h3>
      <span className="live-money num">{fmt(Math.round(v))}</span>
      {sold && (
        <span key={sold.id} className="live-sold num">
          {copy.sold(fmtMoney(sold.amount, sold.currency, sold.exponent))}
        </span>
      )}
    </div>
  )
}
