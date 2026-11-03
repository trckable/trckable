// A sale: the amount and the way to it, from the latest buyers the report already reads (never a name or an id of the buyer).
import { useEffect, useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { SourceChip } from '../../features/journey/SourceChip'
import { extrasApi, type Buyer } from '../../features/extras/extrasApi'
import type { Site } from '../../lib/api'
import { countryName, fmtMoney } from '../../lib/format'
import { Flag } from '../ui/Flag'
import { dayOf } from './days'
import { eventCopy as t } from './eventCopy'
import type { Notice } from './notices'

const DAY = 86400
const HOUR = 3600
/** The latest sales asked for: a sale told by the bell is from the last week, and a busy week still has it in the newest. */
const ASKED = 50

function kindWord(kind: string): string {
  switch (kind) {
    case 'renewal':
      return t.kindRenewal
    case 'subscription':
    case 'new':
      return t.kindNew
    case 'upgrade':
      return t.kindUpgrade
    default:
      return t.kindSale
  }
}

/** The sales of the notice's hour (a notice is one hour's sales), newest first. */
export const inHour = (list: Buyer[], hour: number): Buyer[] => list.filter((b) => Date.parse(b.at) / 1000 >= hour && Date.parse(b.at) / 1000 < hour + HOUR)

export function EventSale({ n, site }: { n: Notice; site: Site }) {
  const [got, setGot] = useState<{ list: Buyer[] } | 'failed' | null>(null)
  useEffect(() => {
    let live = true
    const q = { from: dayOf(n.at - DAY, site.timezone), to: dayOf(n.at + DAY, site.timezone) }
    extrasApi.buyers(site.id, q, ASKED).then(
      (d) => live && setGot({ list: inHour(d.buyers, n.at) }),
      () => live && setGot('failed'),
    )
    return () => {
      live = false
    }
  }, [n.at, site.id, site.timezone])
  return (
    <>
      <b className="ev-big num">{n.sub}</b>
      {got === null && <Loading height={80} label={t.loading} />}
      {got === 'failed' && <p className="ev-note" role="alert">{t.failed}</p>}
      {got && got !== 'failed' && got.list.length === 0 && <p className="ev-note">{t.noVisit}</p>}
      {got && got !== 'failed' && got.list.map((b) => (
        <dl key={b.id} className="ev-facts">
          <dt>{t.amount}</dt>
          <dd>
            {fmtMoney(b.amount, site.currency, 2)} · {kindWord(b.kind)}
          </dd>
          {b.channel && (
            <>
              <dt>{t.from}</dt>
              <dd>
                <SourceChip channel={b.channel} referrer={b.referrer ?? ''} />
              </dd>
            </>
          )}
          {!!b.pages?.length && (
            <>
              <dt>{t.firstPages}</dt>
              <dd>{b.pages.map((p) => <code key={p}>{p} </code>)}</dd>
            </>
          )}
          {b.country && (
            <>
              <dt>{t.country}</dt>
              <dd>
                <Flag code={b.country} /> {countryName(b.country)}
              </dd>
            </>
          )}
        </dl>
      ))}
    </>
  )
}
