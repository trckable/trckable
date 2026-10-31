// The tabs that are a list of lines, as Sales is: what changed (highlights), the latest buyers and the latest people.
// Each reads what the old card read; a tap does what it did.
import { useEffect, useState } from 'react'
import { XEmpty, XError, XSec } from '../../../ui/XBits'
import { Loading } from '../../../../components/loading/Loading'
import { CookielessOff } from '../../../../features/cookieless/Off'
import { call, type ReportQuery } from '../../../../lib/api'
import { countryName } from '../../../../lib/format'
import { visibleInterval } from '../../../../lib/visibleInterval'
import { channelColor, channelLabel } from '../../../../lib/palette'
import { liveNow } from '../../../../features/live/api'
import { deepCopy } from '../../../../features/cards/deepCopy'
import { ago, peopleOf, span, type EventRow, type Person } from '../../../../features/cards/peopleModel'
import { extrasApi, type Insight } from '../../../../features/extras/extrasApi'
import { extrasCopy } from '../../../../features/extras/copy'
import { highlightRows, type Tone } from '../../../../features/extras/highlightModel'
import { pathOf } from '../../../../features/extras/Buyers'
import { useLoad } from '../../data/useLoad'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'
import { Flag } from '../../../ui/Flag'

const SIGN: Record<Tone, string> = { up: '▲', down: '▼', money: '$', warn: '!', new: '+' }
const KIND: Record<Tone, string> = { up: 'new', down: 'refund', money: 'renewal', warn: 'refund', new: 'upgrade' }

export function HighlightLines({ x, list }: { x: XCtx; list: Insight[] }) {
  return (
    <div aria-label={extrasCopy.highlights.label}>
      {highlightRows(list, x.money).map((r) => (
        <button key={r.key} type="button" className="sale xbtn" aria-label={`${r.text}. ${extrasCopy.highlights.filter(r.value || r.dim)}`} onClick={() => x.pick(r.dim, r.value)}>
          <span className={`mk-tag ${KIND[r.tone]}`}>{SIGN[r.tone]}</span>
          <span className="gn">
            <div>{r.text}</div>
          </span>
        </button>
      ))}
    </div>
  )
}

export function Buyers({ x, query }: { x: XCtx; query: ReportQuery }) {
  const c = extrasCopy.buyers
  const [now] = useState(() => Date.now())
  const key = `${x.site.id}|${query.from}|${query.to}|${query.attr ?? ''}|${query.testPayments ? 'test' : ''}|${JSON.stringify(query.filters ?? [])}`
  const here = useLoad(key, () => extrasApi.buyers(x.site.id, query).then((d) => d.buyers), true)
  if (here.state === 'loading') return <Loading height={164} />
  if (here.state === 'error') return <XError title={c.failed} onRetry={here.retry} />
  const list = here.data
  if (list.length === 0) return <XEmpty title={c.none} hint="" />
  return (
    <>
      <XSec a={copy.latestBuyers(list.length)} b={`${x.money(list.reduce((p, b) => p + b.amount, 0))} ${copy.net}`} />
      {list.map((b) => {
        const path = pathOf(b)
        const meta = b.visits ? [c.visits(b.visits), b.seconds !== undefined ? c.toBuy(b.seconds) : ''].filter(Boolean).join(' · ') : ''
        return (
          <div key={b.id} className="sale">
            <i className="xdt" style={{ background: channelColor(b.channel ?? '') }} aria-hidden="true" />
            <span className="gn">
              <div title={path.join(' → ')}>{path.join(' → ') || c.direct}</div>
              <div className="mk-quiet" style={{ fontSize: '12px' }}>
                {[meta, c.ago(Math.max(0, (now - Date.parse(b.at)) / 1000))].filter(Boolean).join(' · ')}
              </div>
            </span>
            <span className="amt">+{x.money(b.amount)}</span>
          </div>
        )
      })}
    </>
  )
}

export function People({ x, onPick }: { x: XCtx; onPick: (visitor: string) => void }) {
  const c = deepCopy.people
  const { site } = x
  const [people, setPeople] = useState<Person[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  const [online, setOnline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let live = true
    const read = () => {
      call<{ events: EventRow[] }>('GET', `/sites/${encodeURIComponent(site.id)}/events?limit=400`)
        .then((d) => {
          if (!live) return
          setPeople(peopleOf(d.events))
          setFailed(false)
          setNow(Date.now())
        })
        .catch(() => live && setFailed(true))
      liveNow(site.id)
        .then((d) => live && setOnline(d.online))
        .catch(() => undefined)
    }
    read()
    const stop = visibleInterval(read, 30_000)
    return () => {
      live = false
      stop()
    }
  }, [site.id, round])
  if (site.cookieless) return <CookielessOff title={c.title} />
  if (failed && !people) return <XError title={c.failed} onRetry={() => setRound((n) => n + 1)} />
  if (!people) return <Loading height={164} />
  if (people.length === 0) return <XEmpty title={c.none} hint="" />
  return (
    <>
      {online !== null && <XSec a={c.title} b={c.online(online)} />}
      {people.map((p) => {
        const source = p.referrer ? `${channelLabel(p.channel)} · ${p.referrer}` : channelLabel(p.channel)
        const color = channelColor(p.channel)
        return (
          <button key={p.visitor} type="button" className="sale xbtn" title={c.open} onClick={() => onPick(p.visitor)}>
            <span className="xface" aria-hidden="true" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
              {channelLabel(p.channel).charAt(0).toUpperCase()}
            </span>
            <span className="gn">
              <div className="mono">{p.path}</div>
              <div className="mk-quiet" style={{ fontSize: '12px' }}>
                {p.country && <><Flag code={p.country} />{' '}</>}{[p.country ? countryName(p.country) : '', source, p.device, p.pages > 0 ? c.pages(p.pages, span(p.seconds)) : ''].filter(Boolean).join(' · ')}
              </div>
            </span>
            <span className="mk-quiet">{ago(now - p.last)}</span>
          </button>
        )
      })}
    </>
  )
}
