// Tech's three leaders: the device, browser and system most people used, a tap filters by it.
import { fmtPct } from '../../../lib/format'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { SummaryCards } from '../../ui/SummaryCards'
import { rowMark } from '../rowMarks'
import type { Top } from '../types'

const TAB = { device: 'devices', browser: 'browsers' } as const

/** The real device or browser mark before the value, as a flag stands before a country; a system has none, so its card wears an icon. */
function markOf(t: Top) {
  if (t.dim === 'os') return null
  return rowMark(TAB[t.dim], { val: t.val, name: t.val, v: 0, c: 0, st: '' })
}

export function TopTiles({ tops, x }: { tops: Top[]; x: XCtx }) {
  const items = tops.map((t) => {
    const mark = markOf(t)
    return {
      key: t.dim,
      data: t.dim,
      icon: mark ? undefined : 'tech',
      mark,
      label: copy.top[t.dim],
      val: t.val,
      unit: fmtPct(t.share),
      sub: copy.ofVisitors,
      onClick: () => x.pick(t.dim, t.val),
    }
  })
  return <SummaryCards items={items} />
}
