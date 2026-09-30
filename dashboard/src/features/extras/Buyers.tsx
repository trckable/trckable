// What they did → Latest buyers: the last sales, each with its amount, the path
// that led to it (where from → the first pages → paid), how many visits and how
// long it took, and how long ago. No name, no email, no id: the path is the
// journey the report already reads, never the person.
import { useEffect, useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import type { ReportQuery } from '../../lib/api'
import { extrasApi, type Buyer } from './extrasApi'
import { channelColor, channelLabel } from '../../lib/palette'
import { extrasCopy } from './copy'
import './extras.css'

const c = extrasCopy.buyers

/** "google.com → /blog → /pricing → paid". */
export const pathOf = (b: Buyer): string[] => {
  const from = b.referrer || (b.channel ? channelLabel(b.channel) : '')
  return from ? [from, ...(b.pages ?? []), c.paid] : []
}

export default function Buyers({ site, query, money }: { site: string; query: ReportQuery; money: (minor: number) => string }) {
  const [now] = useState(() => Date.now())
  const [found, setFound] = useState<{ key: string; list: Buyer[] | null } | null>(null)
  const key = `${site}|${query.from}|${query.to}`
  useEffect(() => {
    let live = true
    extrasApi
      .buyers(site, query)
      .then((d) => live && setFound({ key, list: d.buyers }))
      .catch(() => live && setFound({ key, list: null }))
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  const here = found && found.key === key ? found : null
  if (!here) return <Loading height={164} />
  if (!here.list) return <p className="faint">{c.failed}</p>
  if (here.list.length === 0) return <p className="faint kit-empty">{c.none}</p>
  return (
    <ol className="by">
      {here.list.map((b) => {
        const path = pathOf(b)
        return (
          <li key={`${b.at}${b.amount}`} className="by-row">
            <span className="by-top">
              <b className="num by-amount">{money(b.amount)}</b>
              <span className="faint num">{c.ago(Math.max(0, (now - Date.parse(b.at)) / 1000))}</span>
            </span>
            {path.length > 0 && (
              <span className="by-path num" title={path.join(' → ')}>
                <i className="dot" style={{ background: channelColor(b.channel ?? '') }} aria-hidden="true" />
                {path.join(' → ')}
              </span>
            )}
            {!!b.visits && (
              <span className="faint by-meta">
                {c.visits(b.visits)}
                {b.seconds !== undefined && ` · ${c.toBuy(b.seconds)}`}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
