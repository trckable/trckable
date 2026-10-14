// Overview: one sentence about the day across every site, a strip of
// the totals, then the sites in the order they matter (needs attention,
// setting up, unusual today, steady) beside a live feed.
import { useMemo } from 'react'
import { accountTotals } from '../features/incidents/model'
import { useAccountIncidents, useNow } from '../features/incidents/useIncidents'
import type { Surge } from '../features/signals/surge'
import { SiteMark } from '../components/SiteMark'
import { StateDot } from '../features/sites/StateDot'
import { span, when } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { cellOf, revenueHeadline, revenueStrip, revenueTotal, type Cell, type Lens } from './allLens'
import { byRevenue, feedOf, hasBaseline, headline, items, MOVE, moneyText, ordered, refWord, revenueOf, whyLine, type Item, type Kind } from './allNext'
import { next } from './allNextCopy'
import { copy as incidents } from '../features/incidents/copy'
import { fromStart } from './allSitesLogic'
import type { ViewLens } from './allView'
import { Spark } from './AllSitesSpark'
import './AllNext.css'

type Props = { lens: Lens; rows: SiteRow[]; sites: Site[]; surges: Map<string, Surge>; colorOf: (id: string) => string; start: number; period: string; days: number; open: (lens: ViewLens) => void }

const GROUPS: { kind: Kind; title: string }[] = [
  { kind: 'attention', title: next.secAttention },
  { kind: 'setup', title: next.secSetup },
  { kind: 'lower', title: next.secLower },
  { kind: 'busier', title: next.secBusier },
  { kind: 'steady', title: next.secSteady },
  { kind: 'quiet', title: next.secQuiet },
]

/** How today stands against the usual pace: a small arrow and percent; amber when lower, the sentence in the tooltip. */
function Chip({ i, tip }: { i: Item; tip: string }) {
  if (i.surge) return <span className="nx-chip up" title={tip}>{'▲ ' + i.surge.times.toFixed(1) + '×'}</span>
  const move = i.move
  if (i.kind === 'attention' || move === null || Math.abs(move) < 0.005) return null
  const tone = move <= -MOVE ? 'low' : move >= MOVE ? 'up' : ''
  return <span className={'nx-chip ' + tone} title={tip}>{(move > 0 ? '↑ +' : '↓ −') + fmtInt(Math.abs(move) * 100) + '%'}</span>
}

/** Who is online now, large with a live dot; grey and 0 when no one is. */
function Pulse({ i, tip }: { i: Item; tip: string }) {
  const last = i.site?.last_event_at
  const silent = i.status === 'quiet' && last ? span(Date.now() / 1000 - last) : ''
  return (
    <span className="nx-pulse">
      <span className={'nx-online' + (i.online > 0 ? ' on' : '')}>
        <i aria-hidden="true" />
        <b>{i.row.error ? '–' : fmtInt(i.online)}</b>
        <small>{next.onlineWord}</small>
      </span>
      <span className="nx-today-n">
        <span>{fmtInt(i.today)}</span> <small>{next.todayWord}</small>
        <Chip i={i} tip={tip} />
        {silent && <span className="nx-chip bad">{next.noVisits(silent)}</span>}
      </span>
    </span>
  )
}

/** The line beside a site's number: its visitors' days, or its share of the revenue. */
function Trend({ lens, cell, i, start, color }: { lens: Lens; cell: Cell; i: Item; start: number; color: string }) {
  if (lens === 'revenue') {
    return cell.share === null ? <span className="nx-flat" aria-hidden="true" /> : <span className="nx-share" aria-hidden="true"><i style={{ width: `${Math.max(2, cell.share)}%` }} /></span>
  }
  if (i.row.visitors <= 0) return <span className="nx-flat" aria-hidden="true" />
  return <Spark values={fromStart(i.row.series, start)} color={i.kind === 'attention' ? 'var(--money)' : color} h={30} />
}

function Line({ i, start, against, color, lens, total }: { i: Item; start: number; against: string; color: string; lens: Lens; total: number }) {
  const r = i.row
  const cell = cellOf(lens, i, total)
  const hurt = i.kind === 'attention'
  const waiting = i.kind === 'setup'
  const line = lens === 'visitors' || hurt ? whyLine(i, against) : cell.note
  const tip = i.usual !== null ? next.whyMover(fmtInt(i.today), fmtInt(i.usual), against) : ''
  // The comparison sentence lives in the chip's tooltip; a row keeps a line only for what is wrong.
  const why = lens === 'visitors' && line === tip ? '' : line
  const live = lens === 'visitors' && !waiting
  return (
    <button type="button" className={'nx-line' + (live ? ' live' : '') + (hurt ? ' hurt ' + i.status : '')} onClick={() => navigate('/' + encodeURIComponent(r.domain))}>
      <span className="nx-name">
        {i.site && <StateDot site={i.site} />}
        <SiteMark site={i.site ?? r} size={28} />
        <span className="nx-who">
          <b title={r.domain}>{r.name || r.domain}</b>
          {r.name && r.name !== r.domain && <small className="muted">{r.domain}</small>}
        </span>
      </span>
      {waiting && lens === 'visitors' ? (
        <span className="nx-action">{next.setupAction}</span>
      ) : (
        <>
          {live ? (
            <Pulse i={i} tip={tip} />
          ) : (
            <span className="nx-num">
              <b>{r.error ? '–' : cell.main}</b>
              <small>{cell.unit}</small>
            </span>
          )}
          <span className="nx-spark">
            <Trend lens={lens} cell={cell} i={i} start={start} color={color} />
          </span>
        </>
      )}
      {why && <span className="nx-why muted">{why}</span>}
    </button>
  )
}

/** The Uptime card: the period's incidents across the shown sites, and how much of it they were up. */
function UptimeCard({ sites, days, open }: { sites: Site[]; days: number; open: () => void }) {
  const { list, ready, failed } = useAccountIncidents(days)
  const now = useNow()
  // A site with no visit and no check yet has not been watched: it stays out of the totals.
  const t = useMemo(() => accountTotals(sites.filter((x) => x.last_event_at || x.check), list, days, now), [sites, list, days, now])
  const known = ready && !failed
  const unwatched = known && !t.watched && t.count === 0
  const figure = known ? next.uptimeCount(t.count) : '–'
  const site = sites.find((s) => s.id === t.down[0])
  let note = next.uptimeUp(t.pct.toFixed(1))
  if (t.down.length === 1) note = next.uptimeDown(site?.name || site?.domain || '')
  if (t.down.length > 1) note = next.uptimeDownMany(t.down.length)
  return (
    <button type="button" className="nx-card" onClick={open}>
      <small>{incidents.lensUptime}</small>
      <b>{unwatched ? next.uptimeUnwatched : figure}</b>
      {known && <em className={t.down.length > 0 ? 'warn' : ''}>{unwatched ? next.uptimeUnwatchedNote : note}</em>}
    </button>
  )
}

export function AllToday({ lens, rows, sites, surges, colorOf, start, period, days, open }: Props) {
  const list = items(rows, sites, surges)
  const head = headline(list, rows)
  const ref = refWord(rows)
  const online = list.reduce((n, i) => n + i.online, 0)
  const today = list.reduce((n, i) => n + (i.row.error ? 0 : i.today), 0)
  const money = revenueOf(rows)
  const feed = feedOf(list)
  const total = revenueTotal(rows)
  const figures = lens === 'revenue' ? revenueStrip(list, moneyText(money)) : null
  const sorted = ordered(list)
  return (
    <div className="nx-today">
      <section className="nx-headline" aria-live="polite">
        <h2>
          {head.alarm && <span className="warn">{head.alarm} </span>}
          {lens === 'revenue' ? revenueHeadline(list, moneyText(money)) : head.lead} {head.tail && <span className={head.fine ? 'fine' : 'warn'}>{head.tail}</span>}
        </h2>
      </section>
      <div className="nx-strip">
        {figures?.map((f) => (
          <div key={f.label}>
            <small>{f.label}</small>
            <b>{f.value}</b>
          </div>
        ))}
        {!figures && <div>
          <small>{next.onlineNow}</small>
          <b className={online > 0 ? 'live' : ''}>{online > 0 && <i aria-hidden="true" />}{fmtInt(online)}</b>
        </div>}
        {!figures && (
          <div>
            <small>{next.visitorsTodayLabel}</small>
            <b>{fmtInt(today)}</b>
            {hasBaseline(list) && <em>{next.paceNote(ref)}</em>}
          </div>
        )}
        {!figures && money.length > 0 && (
          <button type="button" className="nx-card" onClick={() => open('revenue')}>
            <small>{next.totalRevenue}</small>
            <b>{moneyText(money)}</b>
            <em>{period}</em>
          </button>
        )}
        {!figures && <UptimeCard sites={sites} days={days} open={() => open('uptime')} />}
      </div>
      <div className="nx-cols">
        <div className="nx-sites">
          {lens === 'revenue' && (
            <section aria-label={next.totalRevenue}>
              <div className="nx-list">
                {byRevenue(list).map((i) => (
                  <Line key={i.row.id} i={i} start={start} against={ref} color={colorOf(i.row.id)} lens={lens} total={total} />
                ))}
              </div>
            </section>
          )}
          {lens === 'visitors' &&
            GROUPS.map((g) => {
              const group = sorted.filter((i) => i.kind === g.kind)
              return (
                group.length > 0 && (
                  <section key={g.kind} aria-label={g.title}>
                    <h3>{g.title}</h3>
                    <div className="nx-list">
                      {group.map((i) => (
                        <Line key={i.row.id} i={i} start={start} against={ref} color={colorOf(i.row.id)} lens={lens} total={total} />
                      ))}
                    </div>
                  </section>
                )
              )
            })}
        </div>
        <aside className="nx-feedcol" aria-label={next.feed}>
          <h3>{next.feed}</h3>
          <div className="nx-feed">
            {feed.length === 0 && <p className="muted">{next.feedEmpty}</p>}
            <ul>
              {feed.map((e) => (
                <li key={e.key} className={e.tone}>
                  <SiteMark site={e.mark} size={16} />
                  <span>
                    {e.text}
                    {e.detail && <small>{e.detail}</small>}
                  </span>
                  <time>{when(e.at)}</time>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
