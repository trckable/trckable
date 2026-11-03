// Networks: each internet provider with its visits, how many of them converted and how fast pages load for them. A tap on
// a row filters every table by that provider.
import { fmtInt } from '../../../lib/format'
import { XNote } from '../../ui/XBits'
import { copy as base } from '../copy'
import type { XCtx } from '../ctx'
import { ENOUGH, pctText, SLOW_MS } from '../data/networks'
import { valueOf } from '../filters'
import { copy } from '../networksCopy'
import type { Networks as Model } from '../types'
import { DbIp } from './DbIp'
import { PeopleTable } from './PeopleTable'
import './networks.css'

const NONE = '–'
const DIM = 'network'

export function Networks({ x, d }: { x: XCtx; d: Model }) {
  // A column with nothing measured says nothing: it goes.
  const speed = d.rows.some((r) => r.lcp !== null)
  const top = Math.max(0, ...d.rows.map((r) => r.rate ?? 0))
  const on = valueOf(x.filters, DIM)
  const label = { sales: copy.sales, goal: copy.goal(d.goal ?? ''), engaged: copy.engaged }[d.basis]
  if (d.rows.length === 0) return <PeopleTable x={x} rows={[]} head={copy.head} limit={0} of={0} onAll={x.showAll} />
  return (
    <>
      <p className="xchg-say">{d.say}</p>
      <div className={`xt xnet${speed ? '' : ' nospeed'}`}>
        <div className="xth">
          <span>{copy.head}</span>
          <span>{copy.people}</span>
          <span>{label}</span>
          {speed && <span>{copy.loads}</span>}
        </div>
        {d.rows.slice(0, x.limit).map((r) => (
          <button key={r.value} type="button" className={`xrw${on === r.value ? ' on' : ''}`} aria-pressed={on === r.value} title={r.value} onClick={() => x.pick(DIM, r.value)}>
            <span className="xnet-name">{r.name}</span>
            <span className="mk-n">{fmtInt(r.people)}</span>
            <span className={`xqual-rate${r.rate !== null && r.rate === top ? ' best' : ''}`}>
              <i><b style={{ width: `${((r.rate ?? 0) / (top || 1)) * 100}%` }} /></i>
              <em>{r.rate === null ? NONE : pctText(r.rate)}</em>
            </span>
            {speed && <span className={`mk-n${r.lcp !== null && r.lcp > SLOW_MS ? ' xqual-slow' : ''}`}>{r.lcp === null ? NONE : `${(r.lcp / 1000).toFixed(1)}s`}</span>}
          </button>
        ))}
        {d.rows.length > x.limit && (
          <button type="button" className="mk-more" data-xall="1" onClick={x.showAll}>
            {base.showAll(d.rows.length)}
          </button>
        )}
      </div>
      <p className="xchg-rest">{copy.enough(ENOUGH)}</p>
      <XNote>{copy.note} <DbIp label={copy.credit} /></XNote>
    </>
  )
}
