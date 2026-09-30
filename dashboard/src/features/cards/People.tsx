// People: the last visits as rows of a face, the page they came in on, where
// from and on what, how much they read and how long ago. Opening one opens the
// journey. The head says how many are on the site now.
import { useEffect, useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { CookielessOff } from '../cookieless/Off'
import { call, type Site } from '../../lib/api'
import { countryName, flag } from '../../lib/format'
import { channelColor, channelLabel } from '../../lib/palette'
import { liveNow } from '../live/api'
import { deepCopy } from './deepCopy'
import { ago, peopleOf, span, type EventRow, type Person } from './peopleModel'
import './deep.css'

/** The source's first letter on the source's own colour. */
function Face({ channel }: { channel: string }) {
  const color = channelColor(channel)
  return (
    <span className="pp-face" aria-hidden="true" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {channelLabel(channel).charAt(0).toUpperCase()}
    </span>
  )
}

function Row({ p, now, onPick }: { p: Person; now: number; onPick: (visitor: string) => void }) {
  const c = deepCopy.people
  const source = p.referrer ? `${channelLabel(p.channel)} · ${p.referrer}` : channelLabel(p.channel)
  return (
    <li>
      <button type="button" className="pp-row" onClick={() => onPick(p.visitor)} title={c.open}>
        <Face channel={p.channel} />
        <span className="pp-what">
          <span className="pp-path num">{p.path}</span>
          <span className="pp-from faint">
            {p.country && <span aria-hidden="true">{flag(p.country)}</span>}
            {[p.country ? countryName(p.country) : '', source, p.device].filter(Boolean).join(' · ')}
          </span>
        </span>
        {p.pages > 0 && <span className="pp-chip num">{c.pages(p.pages, span(p.seconds))}</span>}
        <span className="pp-ago num faint">{ago(now - p.last)}</span>
      </button>
    </li>
  )
}

export default function People({ site, onPick }: { site: Site; onPick: (visitor: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [online, setOnline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let live = true
    const read = () => {
      call<{ events: EventRow[] }>('GET', `/sites/${encodeURIComponent(site.id)}/events?limit=400`)
        .then((d) => {
          if (!live) return
          setPeople(peopleOf(d.events))
          setNow(Date.now())
        })
        .catch(() => live && setPeople([]))
      liveNow(site.id)
        .then((d) => live && setOnline(d.online))
        .catch(() => undefined)
    }
    read()
    const t = setInterval(read, 30_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [site.id])
  if (site.cookieless) return <CookielessOff title={deepCopy.people.title} />
  return (
    <div className="pp-panel">
      <div className="tc-tools">{online !== null && <span className="pp-online num">{deepCopy.people.online(online)}</span>}</div>
      {!people && <Loading height={140} />}
      {people && people.length === 0 && <span className="faint">{deepCopy.people.none}</span>}
      {people && people.length > 0 && (
        <ul className="pp">
          {people.map((p) => (
            <Row key={p.visitor} p={p} now={now} onPick={onPick} />
          ))}
        </ul>
      )}
    </div>
  )
}
