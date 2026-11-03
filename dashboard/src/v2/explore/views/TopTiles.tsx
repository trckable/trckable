// Tech's three leaders: the device, browser and system most people used, a tap filters by it.
import { fmtPct } from '../../../lib/format'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { SummaryCards } from '../../ui/SummaryCards'
import type { Top } from '../types'

export function TopTiles({ tops, x }: { tops: Top[]; x: XCtx }) {
  return (
    <SummaryCards
      items={tops.map((t) => ({
        key: t.dim,
        data: t.dim,
        label: copy.top[t.dim],
        val: t.val,
        unit: fmtPct(t.share),
        sub: copy.ofVisitors,
        onClick: () => x.pick(t.dim, t.val),
      }))}
    />
  )
}
