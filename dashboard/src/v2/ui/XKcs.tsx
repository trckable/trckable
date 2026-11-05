// The walkthrough's four numbers with their line, and the plain summary row of search, places, speed and pages.
import { fmtPct } from '../../lib/format'
import { copy } from '../explore/copy'
import { Flag } from './Flag'
import { Spark } from './KpiCard'
import { SummaryCards } from './SummaryCards'
import type { Kc, Tone, Xkc } from '../explore/types'

export function XKcs({ items }: { items: Kc[] }) {
  return (
    <SummaryCards
      items={items.map((k) => ({
        key: k.icon,
        data: k.icon,
        icon: k.icon,
        label: k.label,
        val: k.val,
        unit: k.unit,
        tag: k.note.t,
        tone: k.note.c as Tone,
        color: k.st === 'dn' ? 'var(--mk-red)' : (k.col ?? 'var(--mk-lime)'),
        chart:
          k.share !== undefined ? (
            <span className="sum-share"><b style={{ width: `${Math.min(100, k.share * 100)}%` }} /></span>
          ) : (
            <Spark vals={k.vals} h={24} lo={k.lo} hi={k.hi} />
          ),
        sub: k.share !== undefined ? `${fmtPct(k.share)} ${copy.ofPeople}` : undefined,
      }))}
    />
  )
}

export function XKcsPlain({ items }: { items: Xkc[] }) {
  return (
    <SummaryCards
      items={items.map((k) => ({
        key: k.label,
        label: k.label,
        val: k.val,
        unit: k.unit,
        tag: k.tag,
        tone: k.tone,
        sub: k.detail,
        icon: k.flag ? undefined : k.icon,
        mark: k.flag && <Flag code={k.flag} width={22} />,
        at: k.at,
      }))}
    />
  )
}
