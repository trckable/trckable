// Direction 3, Mission control: a live strip with everyone online and the last
// 30 minutes (a bar per minute, the sites stacked in their colours), then tiles
// sized by activity. Sites that are asleep shrink to a row of chips; a site
// with trouble keeps a warm edge and comes first.
import { StateDot } from '../features/sites/StateDot'
import { when } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { cellOf, revenueTotal, UptimeStrip, type Lens } from './allLens'
import { items, statusText, type Item } from './allNext'
import { next } from './allNextCopy'
import { Spark } from './AllSitesSpark'
import './AllNext.css'

type Props = { lens: Lens; rows: SiteRow[]; sites: Site[]; colorOf: (id: string) => string }

const MINUTES = 30
const open = (r: SiteRow) => navigate('/' + encodeURIComponent(r.domain))

function Strip({ list, colorOf }: { list: Item[]; colorOf: (id: string) => string }) {
  const W = 300
  const H = 70
  const series = list.filter((i) => !i.row.error && (i.row.online_series?.some((v) => v > 0) ?? false))
  const at = (m: number) => series.map((i) => ({ i, v: i.row.online_series?.[m - (MINUTES - (i.row.online_series?.length ?? MINUTES))] ?? 0 }))
  const totals = Array.from({ length: MINUTES }, (_, m) => at(m).reduce((n, x) => n + x.v, 0))
  const max = Math.max(1, ...totals)
  const bw = W / MINUTES
  const online = list.reduce((n, i) => n + i.online, 0)
  return (
    <section className="nx-strip3" aria-label={next.liveNow}>
      <div className="big">
        <small>{next.liveNow}</small>
        <b className={online > 0 ? 'live' : ''}>{online > 0 && <i aria-hidden="true" />}{fmtInt(online)}</b>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={next.last30}>
          {Array.from({ length: MINUTES }, (_, m) => {
            let y = H
            return (
              <g key={m}>
                <title>{next.barTip(totals[m], MINUTES - 1 - m)}</title>
                <rect x={m * bw} y={0} width={bw} height={H} fill="transparent" />
                {at(m).map(({ i, v }) => {
                  if (!v) return null
                  const h = (v / max) * (H - 4)
                  y -= h
                  return <rect key={i.row.id} x={m * bw + 0.6} y={y} width={bw - 1.2} height={Math.max(h - 0.6, 0.8)} rx={0.8} fill={colorOf(i.row.id)} />
                })}
              </g>
            )
          })}
        </svg>
        <p className="muted">{next.last30}</p>
      </div>
      <ul className="legend" aria-label={next.liveNow}>
        {list.filter((i) => i.online > 0).sort((a, b) => b.online - a.online).map((i) => (
          <li key={i.row.id}>
            <i style={{ background: colorOf(i.row.id) }} aria-hidden="true" />
            {i.row.name || i.row.domain}
            <b>{i.online}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Tile({ i, size, colorOf, lens, total }: { i: Item; size: string; colorOf: (id: string) => string; lens: Lens; total: number }) {
  const r = i.row
  const cell = cellOf(lens, i, total)
  const hurt = i.kind === 'attention'
  const last = i.site?.last_event_at
  return (
    <div role="listitem" className={'nx-tile-item ' + size}>
      <button type="button" className={'nx-tile' + (hurt ? ' hurt ' + i.status : '')} onClick={() => open(r)}>
        <span className="top">
          {i.site && <StateDot site={i.site} />}
          <b title={r.domain}>{r.name || r.domain}</b>
          {hurt && <small className="tag">{statusText(i)}</small>}
        </span>
        <span className={'live' + (i.online > 0 ? ' on' : '')}>
          {i.online > 0 ? (
            <>
              <i aria-hidden="true" />
              <b>{i.online}</b>
              <small>online</small>
            </>
          ) : (
            <small>{next.nobodyYet}</small>
          )}
        </span>
        {size !== 'sm' && lens === 'uptime' && cell.days && <UptimeStrip days={cell.days} />}
        {size !== 'sm' && lens === 'revenue' && cell.series && <Spark values={cell.series} color={colorOf(r.id)} h={size === 'xl' ? 190 : 56} />}
        {size !== 'sm' && lens === 'visitors' && r.online_series && r.online_series.some((v) => v > 0) && <Spark values={r.online_series} color={hurt ? 'var(--money)' : colorOf(r.id)} h={size === 'xl' ? 190 : 56} />}
        <span className="nx-c">
          <b>{r.error ? '–' : lens === 'visitors' ? fmtInt(r.visitors) : cell.main}</b>
          <small>{lens === 'visitors' ? next.tileVisitors : lens === 'uptime' ? cell.unit : cell.delta?.text ?? ''}</small>
        </span>
        <span className="last muted">{last ? next.lastEvent(when(last)) : next.noEvent}</span>
      </button>
    </div>
  )
}

export function AllMission({ lens, rows, sites, colorOf }: Props) {
  const list = items(rows, sites)
  const total = revenueTotal(rows)
  const hurt = list.filter((i) => i.kind === 'attention').sort((a, b) => (a.status === 'down' ? 0 : 1) - (b.status === 'down' ? 0 : 1) || b.row.visitors - a.row.visitors)
  const active = list.filter((i) => i.kind !== 'attention' && i.online > 0).sort((a, b) => b.online - a.online || b.row.visitors - a.row.visitors)
  const asleep = list.filter((i) => i.kind !== 'attention' && i.online === 0).sort((a, b) => b.row.visitors - a.row.visitors)
  const size = (n: number) => (n === 0 ? 'xl' : n < 3 ? 'lg' : 'md')
  return (
    <div className="nx-mission">
      <Strip list={list} colorOf={colorOf} />
      <div className="nx-tiles" role="list">
        {hurt.map((i) => (
          <Tile key={i.row.id} i={i} size="md" colorOf={colorOf} lens={lens} total={total} />
        ))}
        {active.map((i, n) => (
          <Tile key={i.row.id} i={i} size={size(n)} colorOf={colorOf} lens={lens} total={total} />
        ))}
      </div>
      {asleep.length > 0 && (
        <div className="nx-asleep">
          <small>{next.asleep}</small>
          <ul>
            {asleep.map((i) => (
              <li key={i.row.id}>
                <button type="button" onClick={() => open(i.row)} title={i.site?.last_event_at ? next.lastEvent(when(i.site.last_event_at)) : next.noEvent}>
                  {i.site && <StateDot site={i.site} />}
                  {i.row.name || i.row.domain}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
