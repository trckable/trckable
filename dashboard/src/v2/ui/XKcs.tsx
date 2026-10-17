// The cards at the top of an Explore section: the walkthrough's four numbers with their line, and a plainer card
// (a number, its tag and what is usual) for search and speed.
import { Spark } from './KpiCard'
import { XIco } from './XIcons'
import type { Kc, Xkc } from '../explore/types'

const KEEP: Record<string, string> = { money: 'sales' }

export function XKcs({ items }: { items: Kc[] }) {
  return (
    <div className="kcs xk">
      {items.map((k) => {
        const dn = k.st === 'dn'
        return (
          <div key={k.icon} className={`kc ${dn ? 'dn' : ''}`} data-k={k.icon} style={{ color: dn ? 'var(--mk-red)' : (k.col ?? 'var(--mk-lime)') }}>
            <div className="kt">
              <span className="ki">
                <XIco name={KEEP[k.icon] ?? k.icon} className="" />
              </span>
              <span className="kl">{k.label}</span>
              <span className={`kn ${k.note.c}`}>{k.note.t}</span>
            </div>
            <div className="kv">
              {k.val}
              {k.unit && <small>{k.unit}</small>}
            </div>
            <Spark vals={k.vals} h={56} lo={k.lo} hi={k.hi} />
          </div>
        )
      })}
    </div>
  )
}

export function XKcsPlain({ items, three }: { items: Xkc[]; three?: boolean }) {
  return (
    <div className={`kcs xk${three ? ' k3' : ''}`}>
      {items.map((k) => (
        <div key={k.label} className={`kc ns ${k.tone === 'dn' ? 'dn' : ''}`}>
          <div className="kt">
            <span className="ki">
              <XIco name={k.icon} className="" style={{ color: k.tone === 'dn' ? 'var(--mk-red)' : 'var(--mk-lime)' }} />
            </span>
            <span className="kl">{k.label}</span>
            <span className={`kn ${k.tone}`}>{k.tag}</span>
          </div>
          <div className="kv">
            {k.val}
            {k.unit && <small>{k.unit}</small>}
          </div>
          <div className="kd">{k.detail}</div>
        </div>
      ))}
    </div>
  )
}
