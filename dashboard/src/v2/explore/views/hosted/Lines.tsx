// The tabs that are a list of lines, as Sales is: what changed (highlights), and the latest people.
// Each reads what the old card read; a tap does what it did.
import { useEffect, useState } from 'react'
import { XEmpty, XError, XSec } from '../../../ui/XBits'
import { Loading } from '../../../../components/loading/Loading'
import { CookielessOff } from '../../../../features/cookieless/Off'
import { call } from '../../../../lib/api'
import { countryName } from '../../../../lib/format'
import { visibleInterval } from '../../../../lib/visibleInterval'
import { channelColor, channelLabel } from '../../../../lib/palette'
import { liveNow } from '../../../../features/live/api'
import { deepCopy } from '../../../../features/cards/deepCopy'
import { ago, peopleOf, span, type EventRow, type Person } from '../../../../features/cards/peopleModel'
import { type Insight } from '../../../../features/extras/extrasApi'
import { extrasCopy } from '../../../../features/extras/copy'
import { highlightRows, type Tone } from '../../../../features/extras/highlightModel'
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
