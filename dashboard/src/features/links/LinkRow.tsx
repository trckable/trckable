// One tagged link: its mark and name, a bar of its visitors against the busiest, the figures, a 30-day line and when it last brought someone. A tap shows the dashboard for this link alone.
import { Target } from 'lucide-react'
import { Spark } from '../../views/AllSitesSpark'
import { fmtCompact, fmtMoney } from '../../lib/format'
import { RefMark } from '../cards/refIcons'
import type { Link } from './api'
import { copy } from './copy'
import { barPct, sinceLast } from './model'

interface Props {
  link: Link
  max: number
  now: number
  icon: boolean
  /** Goals module on: the badge appears only then. */
  goals: boolean
  money?: { currency: string; exponent: number }
  onOpen: () => void
}

export function LinkRow({ link: l, max, now, icon, goals, money, onOpen }: Props) {
  const host = l.dim === 'referrer'
  return (
    <button type="button" className="yl-row" onClick={onOpen} aria-label={copy.open(l.value)}>
      <span className="yl-name">
        {host ? <RefMark host={l.value} icon={icon} /> : <span className="ref-mark ref-initial" aria-hidden="true">{l.value.charAt(0).toUpperCase()}</span>}
        <span className="yl-tag">{l.value}</span>
      </span>
      <span className="yl-bar" aria-hidden="true">
        <i style={{ width: `${barPct(l.visitors, max)}%` }} />
      </span>
      <span className="yl-n num" title={copy.visitorsOf(String(l.visitors))}>{fmtCompact(l.visitors)}</span>
      <span className="yl-badges">
        {goals && l.goals > 0 && (
          <span className="yl-badge num" title={copy.goals(String(l.goals))}>
            <Target size={13} strokeWidth={1.75} aria-hidden="true" />
            {fmtCompact(l.goals)}
          </span>
        )}
        {money && l.revenue ? (
          <span className="yl-badge yl-money num" title={copy.revenue}>
            {fmtMoney(l.revenue, money.currency, money.exponent)}
          </span>
        ) : null}
      </span>
      <span className="yl-spark" title={copy.spark}>
        <Spark values={l.spark} w={90} h={24} />
      </span>
      <span className="yl-last faint">{copy.last(sinceLast(l.last, now))}</span>
    </button>
  )
}
