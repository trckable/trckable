// The Sales section's two lists of money: every payment, newest first, and every paying customer, the biggest spender first.
// Each row names the visitor (their face and name, as in a journey) or, with no visit linked, the name the payment provider gives the buyer, and the source that brought them.
// A payment with a visit opens their journey; a customer opens a sheet (with a way on to their journey).
// Read a page at a time ("Show more"). Signed-in people only: the shared link never reaches these.
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Avatar } from '../../../../components/visitor/Avatar'
import { Loading } from '../../../../components/loading/Loading'
import type { ReportQuery } from '../../../../lib/api'
import { countryName } from '../../../../lib/format'
import { nameOf } from '../../../../lib/visitor'
import { channelLabel } from '../../../../lib/palette'
import { ago } from '../../../../features/cards/peopleModel'
import { extrasApi, type Customer, type Payment } from '../../../../features/extras/extrasApi'
import { fmtDate } from '../../../../features/journey/when'
import { XEmpty, XError, XSec } from '../../../ui/XBits'
import { Flag } from '../../../ui/Flag'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'
import { providerName } from '../../../../features/verified/model'
import { customerName, initialsOf, methodLabel } from './customerModel'

const LINK_DOCS = 'https://trckable.com/docs/gumroad-paypal/#link-a-checkout-to-the-visit'
const CustomerSheet = lazy(() => import('./CustomerSheet'))

type Page<T> = { rows: T[]; total: number; currency?: string }

/** Pages of one list: the first read again whenever the question changes, the next one appended. */
function usePaged<T>(key: string, read: (offset: number) => Promise<Page<T>>) {
  const [got, setGot] = useState<{ key: string; rows: T[]; total: number; currency?: string } | null>(null)
  const [error, setError] = useState<{ key: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [moreFailedFor, setMoreFailedFor] = useState('')
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    read(0).then(
      (p) => live && setGot({ key, rows: p.rows, total: p.total, currency: p.currency }),
      () => live && setError({ key }),
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
    setMoreFailedFor('')
    read(got.rows.length)
      .then((p) => setGot({ key, rows: [...got.rows, ...p.rows], total: p.total, currency: p.currency }))
      .catch(() => setMoreFailedFor(key))
      .finally(() => setBusy(false))
  }
  const retry = () => {
    setError(null)
    setRound((n) => n + 1)
  }
  const here = got?.key === key ? got : null
  return { rows: here?.rows ?? null, total: here?.total ?? 0, currency: here?.currency ?? '', failed: error?.key === key, moreFailed: moreFailedFor === key && !!here, busy, more, retry }
}

const keyOf = (x: XCtx, q: ReportQuery, list: string) => `${list}|${x.site.id}|${q.from}|${q.to}|${q.attr ?? ''}|${q.testPayments ? 'test' : ''}|${JSON.stringify(q.filters ?? [])}`

/** Where the visitor came from: the channel, then the referring site. Nothing when no visit is known. */
const sourceOf = (channel?: string, referrer?: string) => (channel ? [channelLabel(channel), referrer].filter(Boolean).join(' · ') : '')

/** The buyer's face: their journey face when a visit is linked, else their country's flag, else their initials. Never a question mark. */
export function Who({ visitor, country, name }: { visitor?: string; country?: string; name: string }) {
  if (visitor) return <Avatar id={visitor} size={32} />
  return (
    <span className="xface" aria-hidden="true">
      {country ? <Flag code={country} width={20} /> : initialsOf(name)}
    </span>
  )
}

function Row({ visitor, country, name, onPick, children }: { visitor?: string; country?: string; name: string; onPick: (v: string) => void; children: ReactNode }) {
  if (!visitor)
    return (
      <div className="sale">
        <Who country={country} name={name} />
        {children}
      </div>
    )
  return (
    <button type="button" className="sale xbtn" title={copy.pay.open} onClick={() => onPick(visitor)}>
      <Who visitor={visitor} name={name} />
      {children}
    </button>
  )
}

/** The amount, and under it one muted line: what the buyer paid in when that is not the site's currency, then when. */
function Amount({ cls, text, note }: { cls: string; text: string; note: string }) {
  return (
    <span className="rt">
      <span className={cls}>{text}</span>
      <span className="mk-quiet">{note}</span>
    </span>
  )
}

function More({ shown, list }: { shown: number; list: { total: number; busy: boolean; moreFailed: boolean; more: () => void } }) {
  if (shown >= list.total) return null
  return (
    <>
      {list.moreFailed && (
        <p className="mk-quiet" role="alert">
          {copy.pay.moreFailed}
        </p>
      )}
      <button type="button" className="mk-more" disabled={list.busy} onClick={list.more}>
        {list.moreFailed ? copy.pay.retry : copy.pay.more}
      </button>
    </>
  )
}

/** A buyer with no visit: the provider's name or email, "Customer" when it has them without one, else unknown. */
function strangerName(r: { name?: string; known?: boolean }): string {
  if (!r.known) return copy.pay.unknown
  return customerName(r.name, copy.pay.customer)
}

/** What a payment is called: a refund marks it, else a renewal, else new. */
function tagOf(p: Payment): 'refund' | 'renewal' | 'new' {
  if (p.refunded) return 'refund'
  return p.kind === 'renewal' ? 'renewal' : 'new'
}

export function Payments({ x, query, onPick }: { x: XCtx; query: ReportQuery; onPick: (visitor: string) => void }) {
  const [now] = useState(() => Date.now())
  const list = usePaged(keyOf(x, query, 'pay'), (offset) => extrasApi.payments(x.site.id, query, offset).then((d) => ({ rows: d.payments, total: d.total, currency: d.currency })))
  if (list.failed && !list.rows) return <XError title={copy.pay.failed} onRetry={list.retry} />
  if (!list.rows) return <Loading height={164} />
  if (list.rows.length === 0) return <XEmpty title={copy.pay.none} hint="" />
  return (
    <>
      <XSec a={copy.pay.count(list.total)} />
      {list.rows.map((p: Payment) => {
        const who = p.visitor ? nameOf(p.visitor) : strangerName(p)
        return (
          <Row key={p.id} visitor={p.visitor} country={p.country} name={who} onPick={onPick}>
            <span className="gn">
              <div>
                {who} <span className={`mk-tag ${tagOf(p)}`}>{copy.tags[tagOf(p)]}</span>
              </div>
              <div className="mk-quiet" style={{ fontSize: '12px' }}>
                {[p.country ? countryName(p.country) : '', providerName(p.provider), p.product, sourceOf(p.channel, p.referrer), p.refunded ? copy.pay.refunded(x.money(p.refunded)) : ''].filter(Boolean).join(' · ')}
              </div>
              {!p.visitor && (
                <div className="mk-quiet" style={{ fontSize: '12px' }}>
                  {copy.pay.unlinked} ·{' '}
                  <a href={LINK_DOCS} target="_blank" rel="noreferrer">
                    {copy.pay.unlinkedHow}
                  </a>
                </div>
              )}
            </span>
            <Amount cls={`amt ${p.refunded ? 'neg' : ''}`} text={`+${x.money(p.amount)}`} note={[p.currency ? `${p.currency} → ${list.currency}` : '', methodLabel(p.method, copy.methods), ago(now - Date.parse(p.at))].filter(Boolean).join(' · ')} />
          </Row>
        )
      })}
      <More shown={list.rows.length} list={list} />
    </>
  )
}

export function Customers({ x, query, onPick }: { x: XCtx; query: ReportQuery; onPick: (visitor: string) => void }) {
  const list = usePaged(keyOf(x, query, 'cust'), (offset) => extrasApi.customers(x.site.id, query, offset).then((d) => ({ rows: d.customers, total: d.total, currency: d.currency })))
  const [now] = useState(() => Date.now())
  const [open, setOpen] = useState<Customer | null>(null)
  if (list.failed && !list.rows) return <XError title={copy.pay.failed} onRetry={list.retry} />
  if (!list.rows) return <Loading height={164} />
  if (list.rows.length === 0) return <XEmpty title={copy.pay.noneCustomers} hint="" />
  return (
    <>
      <XSec a={copy.pay.customers(list.total)} b={copy.pay.byTotal} />
      {list.rows.map((c: Customer) => {
        const who = c.visitor ? nameOf(c.visitor) : strangerName(c)
        return (
          <button key={c.id} type="button" className="sale xbtn" title={copy.pay.openCustomer} onClick={() => setOpen(c)}>
            <Who visitor={c.visitor} country={c.country} name={who} />
            <span className="gn">
              <div>{who}</div>
              <div className="mk-quiet" style={{ fontSize: '12px' }}>
                {[c.country ? countryName(c.country) : '', copy.pay.orders(c.orders), sourceOf(c.channel, c.referrer), c.visitor ? '' : copy.pay.unlinked].filter(Boolean).join(' · ')}
              </div>
              <div className="mk-quiet" style={{ fontSize: '12px' }}>
                {copy.pay.firstSeen(fmtDate(Date.parse(c.first_seen), x.site.timezone))} · {copy.pay.lastOrder(fmtDate(Date.parse(c.last_order), x.site.timezone))}
              </div>
            </span>
            <Amount cls="amt" text={x.money(c.spent)} note={ago(now - Date.parse(c.last_order))} />
          </button>
        )
      })}
      <More shown={list.rows.length} list={list} />
      {open && (
        <Suspense fallback={null}>
          <CustomerSheet
            x={x}
            query={query}
            c={open}
            onClose={() => setOpen(null)}
            onJourney={(v) => {
              setOpen(null)
              onPick(v)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
