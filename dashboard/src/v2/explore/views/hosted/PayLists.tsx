// The Sales section's two lists of money: every payment, newest first, and every paying customer, the biggest spender first.
// Each row names the visitor (their face and name, as in a journey) and the source that brought them; a tap opens their journey.
// Read a page at a time ("Show more"). Signed-in people only: the shared link never reaches these.
import { useEffect, useState, type ReactNode } from 'react'
import { Avatar } from '../../../../components/visitor/Avatar'
import { Loading } from '../../../../components/loading/Loading'
import type { ReportQuery } from '../../../../lib/api'
import { countryName } from '../../../../lib/format'
import { nameOf } from '../../../../lib/visitor'
import { channelLabel } from '../../../../lib/palette'
import { ago } from '../../../../features/cards/peopleModel'
import { extrasApi, type Customer, type Payment } from '../../../../features/extras/extrasApi'
import { fmtDate, fmtDayTime } from '../../../../features/journey/when'
import { words } from '../../../../lib/errors'
import { XEmpty, XError, XSec } from '../../../ui/XBits'
import { Flag } from '../../../ui/Flag'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'

type Page<T> = { rows: T[]; total: number }

/** Pages of one list: the first read again whenever the question changes, the next one appended. */
function usePaged<T>(key: string, read: (offset: number) => Promise<Page<T>>) {
  const [got, setGot] = useState<{ key: string; rows: T[]; total: number } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    read(0).then(
      (p) => live && setGot({ key, rows: p.rows, total: p.total }),
      (e: unknown) => live && setError({ key, message: words(e) }),
    )
    return () => {
      live = false
    }
    // The key names everything the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round])
  const more = () => {
    if (!got || busy) return
    setBusy(true)
    read(got.rows.length)
      .then((p) => setGot({ key, rows: [...got.rows, ...p.rows], total: p.total }))
      .catch((e: unknown) => setError({ key, message: words(e) }))
      .finally(() => setBusy(false))
  }
  const retry = () => {
    setError(null)
    setRound((n) => n + 1)
  }
  const here = got?.key === key ? got : null
  return { rows: here?.rows ?? null, total: here?.total ?? 0, failed: error?.key === key, busy, more, retry }
}

const keyOf = (x: XCtx, q: ReportQuery, list: string) => `${list}|${x.site.id}|${q.from}|${q.to}|${q.attr ?? ''}|${q.testPayments ? 'test' : ''}|${JSON.stringify(q.filters ?? [])}`

/** Where the visitor came from: the channel, then the referring site. Nothing when no visit is known. */
const sourceOf = (channel?: string, referrer?: string) => (channel ? [channelLabel(channel), referrer].filter(Boolean).join(' · ') : '')

function Who({ visitor }: { visitor?: string }) {
  if (visitor) return <Avatar id={visitor} size={32} />
  return (
    <span className="xface" aria-hidden="true">
      ?
    </span>
  )
}

function Row({ visitor, onPick, children }: { visitor?: string; onPick: (v: string) => void; children: ReactNode }) {
  if (!visitor)
    return (
      <div className="sale">
        <Who />
        {children}
      </div>
    )
  return (
    <button type="button" className="sale xbtn" title={copy.pay.open} onClick={() => onPick(visitor)}>
      <Who visitor={visitor} />
      {children}
    </button>
  )
}

function Place({ code }: { code?: string }) {
  if (!code) return null
  return (
    <>
      <Flag code={code} /> {countryName(code)}
    </>
  )
}

const More = ({ shown, total, busy, onMore }: { shown: number; total: number; busy: boolean; onMore: () => void }) =>
  shown < total ? (
    <button type="button" className="mk-more" disabled={busy} onClick={onMore}>
      {copy.pay.more}
    </button>
  ) : null

/** What a payment is called: a refund marks it, else a renewal, else new. */
function tagOf(p: Payment): 'refund' | 'renewal' | 'new' {
  if (p.refunded) return 'refund'
  return p.kind === 'renewal' ? 'renewal' : 'new'
}

export function Payments({ x, query, onPick }: { x: XCtx; query: ReportQuery; onPick: (visitor: string) => void }) {
  const [now] = useState(() => Date.now())
  const list = usePaged(keyOf(x, query, 'pay'), (offset) => extrasApi.payments(x.site.id, query, offset).then((d) => ({ rows: d.payments, total: d.total })))
  if (list.failed && !list.rows) return <XError title={copy.pay.failed} onRetry={list.retry} />
  if (!list.rows) return <Loading height={164} />
  if (list.rows.length === 0) return <XEmpty title={copy.pay.none} hint="" />
  return (
    <>
      <XSec a={copy.pay.count(list.total)} />
      {list.rows.map((p: Payment) => (
        <Row key={p.id} visitor={p.visitor} onPick={onPick}>
          <span className="gn">
            <div>
              {p.visitor ? nameOf(p.visitor) : copy.pay.unknown} <span className={`mk-tag ${tagOf(p)}`}>{copy.tags[tagOf(p)]}</span>
            </div>
            <div className="mk-quiet" style={{ fontSize: '12px' }} title={fmtDayTime(Date.parse(p.at))}>
              {[sourceOf(p.channel, p.referrer), ago(now - Date.parse(p.at)), p.refunded ? copy.pay.refunded(x.money(p.refunded)) : ''].filter(Boolean).join(' · ')}
            </div>
          </span>
          <span className={`amt ${p.refunded ? 'neg' : ''}`}>+{x.money(p.amount)}</span>
        </Row>
      ))}
      <More shown={list.rows.length} total={list.total} busy={list.busy} onMore={list.more} />
    </>
  )
}

export function Customers({ x, query, onPick }: { x: XCtx; query: ReportQuery; onPick: (visitor: string) => void }) {
  const list = usePaged(keyOf(x, query, 'cust'), (offset) => extrasApi.customers(x.site.id, query, offset).then((d) => ({ rows: d.customers, total: d.total })))
  if (list.failed && !list.rows) return <XError title={copy.pay.failed} onRetry={list.retry} />
  if (!list.rows) return <Loading height={164} />
  if (list.rows.length === 0) return <XEmpty title={copy.pay.noneCustomers} hint="" />
  return (
    <>
      <XSec a={copy.pay.customers(list.total)} b={copy.pay.byTotal} />
      {list.rows.map((c: Customer) => (
        <Row key={c.id} visitor={c.visitor} onPick={onPick}>
          <span className="gn">
            <div>{c.visitor ? nameOf(c.visitor) : copy.pay.unknown}</div>
            <div className="mk-quiet" style={{ fontSize: '12px' }}>
              {[copy.pay.orders(c.orders), sourceOf(c.channel, c.referrer)].filter(Boolean).join(' · ')}
            </div>
            <div className="mk-quiet" style={{ fontSize: '12px' }}>
              {copy.pay.firstSeen(fmtDate(Date.parse(c.first_seen)))} · {copy.pay.lastOrder(fmtDate(Date.parse(c.last_order)))}
            </div>
            {c.country && (
              <div className="mk-quiet" style={{ fontSize: '12px' }}>
                <Place code={c.country} />
              </div>
            )}
          </span>
          <span className="amt">{x.money(c.spent)}</span>
        </Row>
      ))}
      <More shown={list.rows.length} total={list.total} busy={list.busy} onMore={list.more} />
    </>
  )
}
