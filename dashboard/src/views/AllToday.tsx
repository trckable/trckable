// Direction 1, Today: one sentence about the day across every site, a strip of
// the totals, then the sites in the order they matter (needs attention,
// unusual today, steady) beside a live feed.
import type { Surge } from '../features/signals/surge'
import { StateDot } from '../features/sites/StateDot'
import { when } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { cellOf, lensHeadline, lensStrip, revenueTotal, UptimeStrip, type Cell, type Lens } from './allLens'
import { feedOf, headline, items, moneyText, ordered, refWord, revenueOf, whyLine, type Item, type Kind } from './allNext'
import { next } from './allNextCopy'
import { fromStart } from './allSitesLogic'
import { Spark } from './AllSitesSpark'
import './AllNext.css'

type Props = { lens: Lens; rows: SiteRow[]; sites: Site[]; surges: Map<string, Surge>; colorOf: (id: string) => string; start: number; period: string }

const GROUPS: { kind: Kind; title: string }[] = [
  { kind: 'attention', title: next.secAttention },
  { kind: 'mover', title: next.secMovers },
  { kind: 'steady', title: next.secSteady },
]

function Badge({ i, cell, lens }: { i: Item; cell: Cell; lens: Lens }) {
  if (lens !== 'visitors') return cell.delta ? <span className={'nx-badge ' + cell.delta.tone}>{cell.delta.text}</span> : null
  if (i.surge) return <span className="nx-badge up">{'▲ ' + i.surge.times.toFixed(1) + '×'}</span>
  const move = i.move
  if (i.kind === 'attention' || move === null || Math.abs(move) < 0.4) return null
  const up = move > 0
  return <span className={'nx-badge ' + (up ? 'up' : 'down')}>{(up ? '▲ +' : '▼ −') + fmtInt(Math.abs(move) * 100) + '%'}</span>
}

function Line({ i, start, against, color, lens, total }: { i: Item; start: number; against: string; color: string; lens: Lens; total: number }) {
  const r = i.row
  const cell = cellOf(lens, i, total)
  const hurt = i.kind === 'attention'
  return (
    <button type="button" className={'nx-line' + (hurt ? ' hurt ' + i.status : '')} onClick={() => navigate('/' + encodeURIComponent(r.domain))}>
      <span className="nx-name">
        {i.site && <StateDot site={i.site} />}
        <b title={r.domain}>{r.name || r.domain}</b>
      </span>
      <span className="nx-num">
        <b>{r.error ? '–' : cell.main}</b>
        <small>{cell.unit}</small>
      </span>
      <Badge i={i} cell={cell} lens={lens} />
      <span className="nx-spark">
        {cell.days ? <UptimeStrip days={cell.days} /> : lens === 'revenue' && cell.series ? <Spark values={cell.series} color={color} h={30} /> : lens === 'visitors' && r.visitors > 0 ? <Spark values={fromStart(r.series, start)} color={hurt ? 'var(--money)' : color} h={30} /> : <span className="nx-flat" aria-hidden="true" />}
      </span>
      <span className="nx-why muted">{lens === 'visitors' || hurt ? whyLine(i, against) : cell.note}</span>
    </button>
  )
}

export function AllToday({ lens, rows, sites, surges, colorOf, start, period }: Props) {
  const list = items(rows, sites, surges)
  const head = headline(list, rows)
  const ref = refWord(rows)
  const online = list.reduce((n, i) => n + i.online, 0)
  const today = list.reduce((n, i) => n + (i.row.error ? 0 : i.today), 0)
  const money = revenueOf(rows)
  const feed = feedOf(list)
  const total = revenueTotal(rows)
  const figures = lens === 'visitors' ? null : lensStrip(lens, list, moneyText(money))
  const sorted = ordered(list)
  return (
    <div className="nx-today">
      <section className="nx-headline" aria-live="polite">
        <h2>
          {lens === 'visitors' ? head.lead : lensHeadline(lens, list, moneyText(money))} {head.tail && <span className={head.tail.endsWith('fine.') ? 'fine' : 'warn'}>{head.tail}</span>}
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
            <em>{next.paceNote(ref)}</em>
          </div>
        )}
        {!figures && money.length > 0 && (
          <div>
            <small>{next.revenuePeriod(period)}</small>
            <b>{moneyText(money)}</b>
          </div>
        )}
      </div>
      <div className="nx-cols">
        <div className="nx-sites">
          {GROUPS.map((g) => {
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
        <aside className="nx-feed" aria-label={next.feed}>
          <h3>{next.feed}</h3>
          {feed.length === 0 && <p className="muted">{next.feedEmpty}</p>}
          <ul>
            {feed.map((e) => (
              <li key={e.key} className={e.tone}>
                <i aria-hidden="true" />
                <span>
                  {e.text}
                  {e.detail && <small>{e.detail}</small>}
                </span>
                <time>{when(e.at)}</time>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
