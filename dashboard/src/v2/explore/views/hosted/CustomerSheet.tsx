// One paying customer opened from the Customers list: who they are (what the payment provider says, read live when this opens and
// never stored), their totals and payments in the period, and, only when the provider has license keys for them, a Licenses block.
// A dialog on a desktop, a bottom sheet on a phone. Its own chunk: nobody downloads it before opening a customer.
import { X } from 'lucide-react'
import { Loading } from '../../../../components/loading/Loading'
import { Modal } from '../../../../kit/Modal'
import { countryName } from '../../../../lib/format'
import { extrasApi, type Customer, type CustomerDetail } from '../../../../features/extras/extrasApi'
import { fmtDate } from '../../../../features/journey/when'
import { Flag } from '../../../ui/Flag'
import { SummaryCards } from '../../../ui/SummaryCards'
import { XError } from '../../../ui/XBits'
import { useLoad } from '../../data/useLoad'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'
import type { ReportQuery } from '../../../../lib/api'
import { customerName, licenseView, spanOf, type LicenseView } from './customerModel'
import './customer.css'

const AFTER = { now: () => copy.cust.right, min: copy.cust.min, hour: copy.cust.hour, day: copy.cust.day }

function After({ ms }: { ms: number }) {
  const s = spanOf(ms)
  return <>{AFTER[s.unit](s.n)}</>
}

function Key({ v }: { v: LicenseView }) {
  const c = copy.cust
  return (
    <li className="cs-key">
      <div className="cs-key-head">
        <b>{c.key(v.last4)}</b>
        <span className={`mk-tag cs-st ${v.known ? v.status : ''}`}>{v.known ? c.status[v.status as keyof typeof c.status] : v.status}</span>
      </div>
      <div className="mk-quiet">
        {[c.activations(v.used, v.limit), v.activated ? c.activated : c.notActivated].join(' · ')}
        {v.firstAfter !== undefined && (
          <>
            {' · '}
            <After ms={v.firstAfter} />
          </>
        )}
      </div>
      {v.changes > 0 && <div className="mk-quiet">{c.changes(v.changes)}</div>}
      {v.devices.length > 0 && (
        <div className="cs-devices">
          {v.devices.map((d) => (
            <span key={d.n} className="cs-device">
              {c.device(d.n)} · {fmtDate(d.at)}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

function Body({ x, c, detail }: { x: XCtx; c: Customer; detail: CustomerDetail }) {
  const keys = detail.licenses.map(licenseView)
  return (
    <>
      <SummaryCards
        items={[
          { key: 'spent', label: copy.cust.spent, val: x.money(c.spent) },
          { key: 'orders', label: copy.cust.orders, val: String(c.orders) },
          { key: 'first', label: copy.cust.first, val: fmtDate(Date.parse(c.first_seen)) },
          { key: 'last', label: copy.cust.last, val: fmtDate(Date.parse(c.last_order)) },
        ]}
      />
      {detail.payments.length > 0 && (
        <section aria-label={copy.cust.payments}>
          <h3 className="cs-h">{copy.cust.payments}</h3>
          <ul className="cs-list">
            {detail.payments.map((p) => (
              <li key={p.id} className="cs-pay">
                <span>{fmtDate(Date.parse(p.at))}</span>
                <span className="mk-quiet">{p.refunded ? copy.pay.refunded(x.money(p.refunded)) : ''}</span>
                <b className={p.refunded ? 'neg' : ''}>{x.money(p.amount)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
      {keys.length > 0 && (
        <section aria-label={copy.cust.licenses}>
          <h3 className="cs-h">{copy.cust.licenses}</h3>
          <ul className="cs-list">
            {keys.map((v, i) => (
              <Key key={`${v.last4}${i}`} v={v} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function CustomerSheet({ x, query, c, onJourney, onClose }: { x: XCtx; query: ReportQuery; c: Customer; onJourney: (visitor: string) => void; onClose: () => void }) {
  const got = useLoad(`cust|${x.site.id}|${c.id}|${query.from}|${query.to}|${query.attr ?? ''}|${query.testPayments ? 'test' : ''}`, () => extrasApi.customer(x.site.id, c.id, query), true)
  const detail = got.state === 'ok' ? got.data : null
  const visitor = c.visitor
  const name = customerName(detail?.name || c.name, copy.pay.customer)
  return (
    <Modal label={copy.pay.customer} className="cust-dialog" keepSize={false} onClose={onClose}>
      <div className="mk">
        <button type="button" className="modal-close cs-close" aria-label={copy.cust.close} onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <header className="cs-head">
          <h2>{name}</h2>
          {detail?.email && detail.email !== name && <div className="mk-quiet">{detail.email}</div>}
          {c.country && (
            <div className="mk-quiet">
              <Flag code={c.country} /> {countryName(c.country)}
            </div>
          )}
        </header>
        {got.state === 'loading' && <Loading height={160} />}
        {got.state === 'error' && <XError title={copy.cust.failed} onRetry={got.retry} />}
        {detail && <Body x={x} c={c} detail={detail} />}
        {visitor && (
          <button type="button" className="xb cs-journey" onClick={() => onJourney(visitor)}>
            {copy.cust.journey}
          </button>
        )}
        <p className="mk-quiet cs-live">{copy.cust.live}</p>
      </div>
    </Modal>
  )
}
