// Table: every site as a row. Totals on top, then a dense table
// that sorts by any column. Pinned sites sit on top, sites with no visit in 30
// days fold into "Dormant". Keys: / search, j and k move, Enter opens.
import { ArrowDown, ArrowUp, Search, Star } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { pin, unpin } from '../features/sites/layout'
import { StateDot } from '../features/sites/StateDot'
import { saveLayout, useSiteLayout } from '../features/sites/useSiteLayout'
import { EMPTY } from '../features/sites/empty'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt, fmtMoney } from '../lib/format'
import { lazyLoad } from '../lib/lazyLoad'
import { navigate } from '../lib/url'
import { cellOf, revenueStrip, revenueTotal, type Cell, type Lens } from './allLens'
import { items, moneyText, revenueOf, statusText, type Item } from './allNext'
import { next } from './allNextCopy'
import { Spark } from './AllSitesSpark'
import './AllNext.css'

const TalkedChip = lazyLoad(() => import('../features/mentions/TalkedChip')) // a mention in the last day: a chunk of its own

type Key = 'name' | 'online' | 'main' | 'change' | 'extra' | 'status'
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
  if (key === 'change') return change(i.row)
  if (key === 'main') return lens === 'revenue' ? (i.row.revenue ?? -1) : i.row.visitors
  return i.row.revenue ?? -1
}

type Sort = { key: Key; dir: 1 | -1 }

const sortOf = (s: Sort, key: Key) => {
  if (s.key !== key) return 'none'
  return s.dir === 1 ? 'ascending' : 'descending'
}

/** Names and statuses start A to Z, numbers start with the biggest; a second click turns it round. */
function nextDir(s: Sort, key: Key): 1 | -1 {
  if (s.key === key) return s.dir === 1 ? -1 : 1
  return key === 'name' || key === 'status' ? 1 : -1
}

const matches = (i: Item, needle: string) => !needle || (i.row.name + ' ' + i.row.domain).toLowerCase().includes(needle)

const mainOf = (lens: Lens, i: Item, cell: Cell): string => (lens === 'revenue' ? cell.main : fmtInt(i.row.visitors))

/** The second figure: the share of the revenue under that lens, else the site's revenue. */
function extraOf(lens: Lens, i: Item, cell: Cell) {
  const r = i.row
  if (lens === 'revenue') return cell.share === null ? <span className="muted">–</span> : fmtInt(cell.share) + '%'
  if (r.revenue === undefined || r.error) return <span className="muted">–</span>
  return fmtMoney(r.revenue, r.currency, r.exponent, { cents: false })
}

const dormantAt = (i: Item, now = Date.now()) => !i.site?.last_event_at || now / 1000 - i.site.last_event_at > DORMANT_S

const order = (x: number | string, y: number | string): number => {
  if (x === y) return 0
  return x < y ? -1 : 1
}

type Props = { lens: Lens; rows: SiteRow[]; sites: Site[]; colorOf: (id: string) => string; start: number; period: string }

export function AllTable({ lens, rows, sites, colorOf, period }: Props) {
  const layout = useSiteLayout() ?? EMPTY
  const [asked, setSort] = useState<Sort>({ key: 'main', dir: -1 })
  // The Revenue lens has no Change column: its sort falls back to the main one.
  const sort = lens === 'revenue' && asked.key === 'change' ? { ...asked, key: 'main' as const } : asked
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  const list = useMemo(() => items(rows, sites), [rows, sites])
  const money = revenueOf(rows)
  const hasMoney = money.length > 0
  const visitors = rows.reduce((n, r) => n + (r.error ? 0 : r.visitors), 0)
  const before = rows.reduce((n, r) => n + (r.error ? 0 : r.previous_visitors), 0)
  const d = delta(visitors, before)
  const total = revenueTotal(rows)
  const revenue = lens === 'revenue'
  const figures = revenue ? revenueStrip(list, moneyText(money)) : null
  // The Revenue lens swaps Change and Trend for the share; Visitors adds the revenue when there is any.
  const extra = revenue || hasMoney
  const cols = 5 + (revenue ? 0 : 2) + (extra ? 1 : 0)
  const up = list.filter((i) => i.status !== 'down' && !i.row.error).length

  const needle = q.trim().toLowerCase()
  const { live, dormant, shown } = useMemo(() => {
    const sorted = list.filter((i) => matches(i, needle)).sort((a, b) => {
      const pa = layout.pinned.includes(a.row.id) ? 0 : 1
      const pb = layout.pinned.includes(b.row.id) ? 0 : 1
      if (pa !== pb) return pa - pb
      return order(valueOf(sort.key, a, lens), valueOf(sort.key, b, lens)) * sort.dir || b.row.visitors - a.row.visitors
    })
    const live = sorted.filter((i) => !dormantAt(i) || layout.pinned.includes(i.row.id))
    const dormant = sorted.filter((i) => !live.includes(i))
    return { live, dormant, shown: open || needle ? [...live, ...dormant] : live }
  }, [list, layout.pinned, needle, sort.key, sort.dir, lens, open])
  const cur = Math.min(at, Math.max(0, shown.length - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // A menu or a button has its own keys.
      if (t.closest('[role^=menu], [role=dialog]') || (e.key === 'Enter' && t.closest('button, a'))) return
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
    <th className={cls} aria-sort={sortOf(sort, key)}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: nextDir(s, key) }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button>
    </th>
  )

  const rowOf = (i: Item, n: number) => {
    const r = i.row
    const pinned = layout.pinned.includes(r.id)
    const cell = cellOf(lens, i, total)
    const dl = r.error ? null : delta(r.visitors, r.previous_visitors)
    return (
      <tr key={r.id} className={n === cur ? 't-cur' : ''} onClick={() => navigate('/' + encodeURIComponent(r.domain))} onMouseEnter={() => setAt(n)}>
        <td className="t-pin">
          <button
            type="button"
            className={pinned ? 'on' : ''}
            aria-pressed={pinned}
            aria-label={(pinned ? next.unpin : next.pin)(r.name || r.domain)}
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
            <Suspense fallback={null}><TalkedChip site={r.id} /></Suspense>
          </span>
        </td>
        <td className="nx-c t-online">{i.online > 0 ? <span className="on"><i aria-hidden="true" />{i.online}</span> : <span className="muted">{fmtInt(0)}</span>}</td>
        <td className="nx-c">{r.error ? '–' : mainOf(lens, i, cell)}</td>
        {!revenue && <td className={'nx-c t-chg ' + (dl?.tone ?? '')}>{dl ? dl.text : '–'}</td>}
        {extra && <td className="nx-c">{extraOf(lens, i, cell)}</td>}
        {!revenue && <td className="t-trend">{r.visitors > 0 ? <Spark values={r.series ?? []} color={colorOf(r.id)} h={26} /> : null}</td>}
        <td className={'t-status ' + i.status}>{statusText(i)}</td>
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
              {head('main', revenue ? next.colRevenue : next.colVisitors, 'nx-c')}
              {!revenue && head('change', next.colChange, 'nx-c t-chg')}
              {extra && head('extra', revenue ? next.colShare : next.colRevenue, 'nx-c')}
              {!revenue && <th className="t-trend">{next.colTrend}</th>}
              {head('status', next.colStatus, 'status')}
            </tr>
          </thead>
          <tbody>
            {live.map((i, n) => rowOf(i, n))}
            {dormant.length > 0 && !needle && (
              <tr className="t-fold">
                <td colSpan={cols}>
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
