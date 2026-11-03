// The walkthrough's four numbers with their line, and the plain summary row of search, places, speed and pages.
import { fmtPct } from '../../lib/format'
import { copy } from '../explore/copy'
import { Flag } from './Flag'
import { Spark } from './KpiCard'
import { RollText } from './RollText'
import { SummaryCards } from './SummaryCards'
import { XIco } from './XIcons'
import type { Kc, Xkc } from '../explore/types'

const KEEP: Record<string, string> = { money: 'sales' }

export function XKcs({ items }: { items: Kc[] }) {
  return (
    <div className="xkw">
    <div className="kcs xk">
      {items.map((k) => {
        const dn = k.st === 'dn'
        return (
          <div key={k.icon} className={`kc ${dn ? 'dn' : ''}`} data-k={k.icon} style={{ color: dn ? 'var(--mk-red)' : (k.col ?? 'var(--mk-lime)') }}>
            <div className="kt">
              <span className="ki">
                <XIco name={KEEP[k.icon] ?? k.icon} className="" />
              </span>
              <span className="kl" title={k.label}>{k.label}</span>
              <span className={`kn ${k.note.c}`}>{k.note.t}</span>
            </div>
            <div className="kv">
              <RollText text={k.val} />
              {k.unit && <small>{k.unit}</small>}
            </div>
            {k.share !== undefined ? (
              <div className="kshare">
                <i><b style={{ width: `${Math.min(100, k.share * 100)}%` }} /></i>
                <span>{fmtPct(k.share)} {copy.ofPeople}</span>
              </div>
            ) : (
              <Spark vals={k.vals} h={56} lo={k.lo} hi={k.hi} />
            )}
          </div>
        )
      })}
    </div>
    </div>
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
        flag: k.flag && <Flag code={k.flag} width={22} />,
        at: k.at,
      }))}
    />
  )
}
