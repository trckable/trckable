// The cards at the top of an Explore section: the walkthrough's four numbers with their line, and a plainer card
// (a number, its tag and what is usual) for search and speed.
import { fmtPct } from '../../lib/format'
import { copy } from '../explore/copy'
import { Flag } from './Flag'
import { Spark } from './KpiCard'
import { RollText } from './RollText'
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

export function XKcsPlain({ items, three }: { items: Xkc[]; three?: boolean }) {
  return (
    <div className="xkw">
    <div className={`kcs xk${three ? ' k3' : ''}`}>
      {items.map((k) => (
        <div key={k.label} className={`kc ns ${k.tone === 'dn' ? 'dn' : ''}`} data-flag={k.flag ? '1' : undefined}>
          <div className="kt">
            <span className="ki">
              <XIco name={k.icon} className="" style={{ color: k.tone === 'dn' ? 'var(--mk-red)' : 'var(--mk-lime)' }} />
            </span>
            <span className="kl" title={k.label}>{k.label}</span>
            <span className={`kn ${k.tone}`}>{k.tag}</span>
          </div>
          <div className="kv" title={k.hint}>
            {k.flag && <Flag code={k.flag} width={26} />}
            <RollText text={k.val} />
            {k.unit && <small>{k.unit}</small>}
          </div>
          {k.at !== undefined && (
            <div className="kg" aria-hidden="true">
              <i /><i /><i />
              <b style={{ left: `${k.at * 100}%` }} />
            </div>
          )}
          <div className="kd">{k.detail}</div>
        </div>
      ))}
    </div>
    </div>
  )
}
