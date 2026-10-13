// Direction 2, Portfolio table: money first. Totals on top, then a dense table
// that sorts by any column. Pinned sites sit on top, sites with no visit in 30
// days fold into "Dormant". Keys: / search, j and k move, Enter opens.
import { ArrowDown, ArrowUp, Search, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { pin, unpin } from '../features/sites/layout'
import { StateDot } from '../features/sites/StateDot'
import { saveLayout, useSiteLayout } from '../features/sites/useSiteLayout'
import { EMPTY } from '../features/sites/empty'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt, fmtMoney } from '../lib/format'
import { navigate } from '../lib/url'
import { cellOf, lensStrip, revenueTotal, UptimeStrip, type Lens } from './allLens'
import { uptimeOf } from './allDesignsFixture'
import { items, moneyText, revenueOf, statusText, type Item } from './allNext'
import { next } from './allNextCopy'
import { Spark } from './AllSitesSpark'
import './AllNext.css'

type Key = 'name' | 'online' | 'visitors' | 'change' | 'revenue' | 'status'
const STATUS = { down: 0, quiet: 1, ok: 2, new: 3 }
const DORMANT_S = 30 * 86400

function change(r: SiteRow): number {
  return r.previous_visitors > 0 ? (r.visitors - r.previous_visitors) / r.previous_visitors : -Infinity
}

/** What a column sorts by; the main column follows the lens. */
function valueOf(key: Key, i: Item, lens: Lens): number | string {
  if (key === 'name') return (i.row.name || i.row.domain).toLowerCase()
  if (key === 'online') return i.online
  if (key === 'status') return STATUS[i.status]
  if (key === 'visitors') return lens === 'revenue' ? (i.row.revenue ?? -1) : lens === 'uptime' ? uptimeOf(i.row, i.site).pct : i.row.visitors
  if (key === 'change') return lens === 'uptime' ? uptimeOf(i.row, i.site).incidents : change(i.row)
  return i.row.revenue ?? -1
}

const dormantAt = (i: Item, now: number) => !i.site?.last_event_at || now / 1000 - i.site.last_event_at > DORMANT_S

type Props = { lens: Lens; rows: SiteRow[]; sites: Site[]; colorOf: (id: string) => string; start: number; period: string }

export function AllTable({ lens, rows, sites, colorOf, period }: Props) {
  const layout = useSiteLayout() ?? EMPTY
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'visitors', dir: -1 })
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  const list = useMemo(() => items(rows, sites), [rows, sites])
  const now = Date.now()
  const money = revenueOf(rows)
  const hasMoney = money.length > 0
  const visitors = rows.reduce((n, r) => n + (r.error ? 0 : r.visitors), 0)
  const before = rows.reduce((n, r) => n + (r.error ? 0 : r.previous_visitors), 0)
  const d = delta(visitors, before)
  const total = revenueTotal(rows)
  const figures = lens === 'visitors' ? null : lensStrip(lens, list, moneyText(money))
  const extra = lens === 'visitors' ? hasMoney : true
  const up = list.filter((i) => i.status !== 'down' && !i.row.error).length

  const needle = q.trim().toLowerCase()
  const match = (i: Item) => !needle || (i.row.name + ' ' + i.row.domain).toLowerCase().includes(needle)
  const sorted = [...list].filter(match).sort((a, b) => {
    const pa = layout.pinned.includes(a.row.id) ? 0 : 1
    const pb = layout.pinned.includes(b.row.id) ? 0 : 1
    if (pa !== pb) return pa - pb
    const x = valueOf(sort.key, a, lens)
    const y = valueOf(sort.key, b, lens)
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.row.visitors - a.row.visitors
  })
  const live = sorted.filter((i) => !dormantAt(i, now) || layout.pinned.includes(i.row.id))
  const dormant = sorted.filter((i) => !live.includes(i))
  const shown = open || needle ? [...live, ...dormant] : live
  const cur = Math.min(at, Math.max(0, shown.length - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/' && !typing) {
        e.preventDefault()
        search.current?.focus()
      } else if (!typing && (e.key === 'j' || e.key === 'k')) {
        setAt((n) => Math.max(0, Math.min(shown.length - 1, n + (e.key === 'j' ? 1 : -1))))
      } else if (e.key === 'Enter' && (!typing || t === search.current) && shown[cur]) {
        navigate('/' + encodeURIComponent(shown[cur].row.domain))
      } else if (e.key === 'Escape' && t === search.current) {
        setQ('')
        search.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, cur])

  const head = (key: Key, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'name' || key === 'status' ? 1 : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button>
    </th>
  )

  const rowOf = (i: Item, n: number) => {
    const r = i.row
    const pinned = layout.pinned.includes(r.id)
    const cell = cellOf(lens, i, total)
    const dl = r.error ? null : cell.delta
    return (
      <tr key={r.id} className={n === cur ? 't-cur' : ''} onClick={() => navigate('/' + encodeURIComponent(r.domain))} onMouseEnter={() => setAt(n)}>
        <td className="t-pin">
          <button
            type="button"
            className={pinned ? 'on' : ''}
            aria-pressed={pinned}
            aria-label={(pinned ? next.unpin : next.pin) + ' ' + (r.name || r.domain)}
            onClick={(e) => {
              e.stopPropagation()
              saveLayout((pinned ? unpin : pin)(sites, layout, r.id))
            }}
          >
            <Star size={14} aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} />
          </button>
        </td>
        <td className="t-site">
          <span className="t-cell">
            {i.site && <StateDot site={i.site} />}
            <b title={r.domain}>{r.name || r.domain}</b>
          </span>
        </td>
        <td className="nx-c t-online">{i.online > 0 ? <span className="on"><i aria-hidden="true" />{i.online}</span> : <span className="muted">0</span>}</td>
        <td className="nx-c">{r.error ? '–' : cell.main}</td>
        <td className={'nx-c t-chg ' + (dl?.tone ?? '')}>{lens === 'uptime' ? cell.unit : dl ? dl.text : '–'}</td>
        {extra && <td className="nx-c">{lens !== 'visitors' ? cell.extra : r.revenue === undefined || r.error ? <span className="muted">–</span> : fmtMoney(r.revenue, r.currency, r.exponent, { cents: false })}</td>}
        <td className="t-trend">{cell.days ? <UptimeStrip days={cell.days} /> : lens === 'revenue' ? (cell.series ? <Spark values={cell.series} color={colorOf(r.id)} h={26} /> : null) : r.visitors > 0 ? <Spark values={r.series ?? []} color={colorOf(r.id)} h={26} /> : null}</td>
        <td className={'t-status ' + i.status}>{statusText(i, now)}</td>
      </tr>
    )
  }

  return (
    <div className="nx-table">
      <div className="nx-totals">
        {figures?.map((f) => (
          <div key={f.label}>
            <small>{f.label}</small>
            <b>{f.value}</b>
          </div>
        ))}
        {!figures && hasMoney && (
          <div>
            <small>{next.totalRevenue}</small>
            <b>{moneyText(money)}</b>
            <em>{period}</em>
          </div>
        )}
        {!figures && (
          <div>
            <small>{next.totalVisitors}</small>
            <b>{fmtInt(visitors)}</b>
            {d && <em className={'delta ' + d.tone}>{d.text} <span>{next.vsBefore}</span></em>}
          </div>
        )}
        {!figures && (
          <div>
            <small>{next.sitesUp}</small>
            <b>{up}/{list.length}</b>
          </div>
        )}
      </div>
      <label className="nx-search">
        <Search size={14} aria-hidden="true" />
        <input ref={search} type="search" value={q} placeholder={next.searchHint} aria-label={next.searchLabel} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="nx-scroll">
        <table aria-label={next.tableLabel}>
          <thead>
            <tr>
              <th className="t-pin" />
              {head('name', next.colSite, 't-site')}
              {head('online', next.colOnline, 'nx-c t-online')}
              {head('visitors', { visitors: next.colVisitors, revenue: next.colRevenue, uptime: next.colUptime }[lens], 'nx-c')}
              {head('change', lens === 'uptime' ? next.colIncidents : next.colChange, 'nx-c t-chg')}
              {extra && head('revenue', { visitors: next.colRevenue, revenue: next.colShare, uptime: next.colDowntime }[lens], 'nx-c')}
              <th className="t-trend">{lens === 'uptime' ? next.colDays : next.colTrend}</th>
              {head('status', next.colStatus, 'status')}
            </tr>
          </thead>
          <tbody>
            {live.map((i, n) => rowOf(i, n))}
            {dormant.length > 0 && !needle && (
              <tr className="t-fold">
                <td colSpan={extra ? 8 : 7}>
                  <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
                    {next.dormant(dormant.length)} <small>{next.dormantNote}</small>
                  </button>
                </td>
              </tr>
            )}
            {(open || needle) && dormant.map((i, n) => rowOf(i, live.length + n))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="empty muted">{next.noMatch}</p>}
      </div>
    </div>
  )
}
