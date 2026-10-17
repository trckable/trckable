// Sales: each sale with who it came from, what kind it was and what it earned, newest first, and a switch by kind.
import { XEmpty, XSec, XSub } from '../../ui/XBits'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { Lock } from './Lock'
import type { Sale, Sales as Model } from '../types'

const KINDS = ['', 'new', 'upgrade', 'renewal', 'refund'] as const

function Line({ s, money }: { s: Sale; money: (minor: number) => string }) {
  return (
    <div className="sale">
      <span className={`mk-tag ${s.kind}`}>{copy.tags[s.kind]}</span>
      <span className="gn">
        <div>{s.label}</div>
        <div className="mk-quiet" style={{ fontSize: '12px' }}>
          {[s.from, s.country, s.device, s.when].filter(Boolean).join(' · ')}
        </div>
      </span>
      <span className={`amt ${s.amt < 0 ? 'neg' : ''}`}>
        {s.amt < 0 ? '' : '+'}
        {money(s.amt)}
      </span>
    </div>
  )
}

export function Sales({ x, d }: { x: XCtx; d: Model }) {
  if (d.state === 'connect') return <Lock k="rev" x={x} />
  if (d.state === 'none') return <XEmpty title={copy.emptyProducts} hint={copy.emptyProductsHint} />
  const list = d.sales.filter((s) => !x.kind || s.kind === x.kind)
  const net = list.reduce((p, s) => p + s.amt, 0)
  return (
    <>
      <XSub label={copy.kindLabel} attr="xkind" value={x.kind} items={KINDS.map((k) => ({ key: k, label: copy.kinds[k || 'all'] }))} onPick={x.setKind} />
      <XSec a={copy.saleCount(list.length)} b={`${x.money(net)} ${copy.net}`} />
      {list.length === 0 ? (
        <XEmpty title={copy.emptyKind} hint={copy.emptyKindHint}>
          {x.kind && (
            <button type="button" className="xb" data-xkind="" onClick={() => x.setKind('')}>
              {copy.showAllSales}
            </button>
          )}
        </XEmpty>
      ) : (
        list.slice(0, x.limit).map((s, i) => <Line key={`${i}${s.when}`} s={s} money={x.money} />)
      )}
      {list.length > x.limit && (
        <button type="button" className="mk-more" id="xMore" onClick={x.showAll}>
          {copy.showAll(list.length)}
        </button>
      )}
    </>
  )
}
