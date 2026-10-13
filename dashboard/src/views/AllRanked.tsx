// Design B, one chart ranked: the totals, every site's visitors as one stacked
// area chart, and below it the sites ranked. Point at a row or a band and the
// others dim; click to keep it lit.
import { useState } from 'react'
import { StateDot } from '../features/sites/StateDot'
import { tag as locale } from '../i18n'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt, fmtMoney } from '../lib/format'
import { navigate } from '../lib/url'
import { copy } from './allDesignsCopy'
import { sumOf } from './allDesignsLogic'
import { bandsOf, OTHER_COLOR } from './allSitesColors'
import { copy as base } from './allSitesCopy'
import { totalsOf } from './allSitesGroups'
import { fromStart } from './allSitesLogic'
import { weekTicks } from './AllSitesChart'
import { Spark } from './AllSitesSpark'
import { tagOf } from './AllTile'

type Props = { rows: SiteRow[]; sites: Site[]; colors: Map<string, string>; days: number; start: number }

/** A row is lit when it is the one picked, dimmed when another is, plain when none is. */
function rowTone(lit: string | null, k: string): string {
  if (!lit) return ''
  return lit === k ? ' lit' : ' dim'
}

const W = 800
const H = 280

const dayLabel = (ago: number) => new Date(Date.now() - ago * 864e5).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

function Stack({ rows, colors, days, start, lit, onLit }: { rows: SiteRow[]; colors: Map<string, string>; days: number; start: number; lit: string | null; onLit: (k: string | null, keep?: boolean) => void }) {
  const [at, setAt] = useState<number | null>(null)
  const points = Math.max(0, ...rows.filter((r) => r.series?.some((v) => v > 0)).map((r) => r.series?.length ?? 0))
  const n = points - start
  if (n <= 0) return <div className="rk-empty faint">{base.empty}</div>
  const bands = bandsOf(rows.map((r) => ({ ...r, series: r.series?.slice(start) ?? null })), colors, n)
  const sums = Array.from({ length: n }, (_, i) => bands.reduce((a, b) => a + b.series[i], 0))
  const max = Math.max(1, ...sums)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const y = (v: number) => H - 4 - (v / max) * (H - 16)
  const floor = new Array<number>(n).fill(0)
  const paths = bands.map((b) => {
    const top = b.series.map((v, i) => floor[i] + v)
    const d = top.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('') + floor.map((_, k) => { const i = n - 1 - k; return `L${x(i).toFixed(1)} ${y(floor[i]).toFixed(1)}` }).join('') + 'Z'
    top.forEach((v, i) => { floor[i] = v })
    return { b, d }
  })
  const step = days / points
  const when = (i: number) => dayLabel(Math.round((n - 1 - i) * step))
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }
  const hot = bands.find((b) => b.key === lit)
  return (
    <div className="rk-chart" onPointerMove={pick} onPointerDown={pick} onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="rk-svg" role="img" aria-label={copy.chartLabel}>
        {[max, max / 2].map((v) => (
          <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} className="all-grid" vectorEffect="non-scaling-stroke" />
        ))}
        {paths.map(({ b, d }) => (
          <path key={b.key} d={d} fill={b.color} fillOpacity={lit && lit !== b.key ? 0.12 : 0.78} stroke="var(--surface)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className="rk-band" onPointerEnter={() => onLit(b.key)} onPointerLeave={() => onLit(null)} onClick={() => onLit(b.key, true)} />
        ))}
        {at !== null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} className="all-cursor" vectorEffect="non-scaling-stroke" />}
      </svg>
      {[max, max / 2].map((v) => (
        <span key={v} className="all-chart-y faint num" style={{ top: `${(y(v) / H) * 100}%` }} aria-hidden="true">
          {fmtInt(Math.round(v))}
        </span>
      ))}
      <div className="all-chart-axis faint" aria-hidden="true">
        {weekTicks(n, step).map((i) => (
          <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>
            {i === 0 && start > 0 ? base.since(when(0)) : when(i)}
          </span>
        ))}
      </div>
      {at !== null && (
        <div className="all-chart-tip" style={{ left: `${Math.min(80, Math.max(20, (x(at) / W) * 100))}%` }}>
          <b>{when(at)}</b>
          {hot && (
            <span>
              <i style={{ background: hot.color }} />
              {hot.label || copy.other}
              <em>{fmtInt(hot.series[at])}</em>
            </span>
          )}
          <span className="sum">
            {base.all} <em>{fmtInt(sums[at])}</em>
          </span>
        </div>
      )}
    </div>
  )
}

export function AllRanked({ rows, sites, colors, days, start }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const [kept, setKept] = useState<string | null>(null)
  const lit = hover ?? kept
  const total = sumOf(rows)
  const money = totalsOf(rows).money
  const d = delta(total.visitors, total.previous)
  const by = new Map(sites.map((s) => [s.id, s]))
  const ranked = [...rows].sort((a, b) => b.visitors - a.visitors)
  const keyOf = (r: SiteRow) => ((colors.get(r.id) ?? OTHER_COLOR) === OTHER_COLOR ? 'other' : r.id)
  const onLit = (k: string | null, keep?: boolean) => {
    if (keep) setKept((p) => (p === k ? null : k))
    else setHover(k)
  }
  return (
    <>
      <section className="rk-totals">
        <div>
          <small className="muted">{copy.visitors}</small>
          <span className="rk-big">
            <b>{fmtInt(total.visitors)}</b>
            {d && <span className={'delta ' + d.tone}>{d.text}</span>}
          </span>
        </div>
        {money && (
          <div>
            <small className="muted">{copy.revenue}</small>
            <span className="rk-big">
              <b className="rk-money">{fmtMoney(money.amount, money.currency, money.exponent)}</b>
            </span>
          </div>
        )}
      </section>
      <section className="rk-card">
        <Stack rows={rows} colors={colors} days={days} start={start} lit={lit} onLit={onLit} />
      </section>
      <section className="rk-table" role="table" aria-label={copy.tableLabel}>
        <div className="rk-row rk-headrow faint" role="row">
          <span role="columnheader">{copy.rank}</span>
          <span role="columnheader" />
          <span role="columnheader">{copy.site}</span>
          <span role="columnheader" className="r">{copy.visitors}</span>
          <span role="columnheader" className="r">{copy.change}</span>
          <span role="columnheader" className="r rk-hide">{copy.share}</span>
          <span role="columnheader" className="rk-hide">{copy.line}</span>
        </div>
        {ranked.map((r, i) => {
          const site = by.get(r.id)
          const dd = r.error ? null : delta(r.visitors, r.previous_visitors)
          const tag = tagOf(site)
          const k = keyOf(r)
          return (
            <div key={r.id} role="row" className={'rk-row rk-line' + rowTone(lit, k)} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)}>
              <span role="cell" className="rk-rank faint num">{i + 1}</span>
              <span role="cell"><i className="rk-dot" style={{ background: colors.get(r.id) ?? OTHER_COLOR }} /></span>
              <span role="cell" className="rk-site">
                <button type="button" className="rk-name" onClick={() => setKept((p) => (p === k ? null : k))} aria-pressed={kept === k}>
                  {site && <StateDot site={site} />}
                  <b>{r.name || r.domain}</b>
                </button>
                {tag && <small className="wall-tag">{tag}</small>}
                <button type="button" className="rk-open faint" onClick={() => navigate('/' + encodeURIComponent(r.domain))}>{base.openSite}</button>
              </span>
              <span role="cell" className="r num rk-v">{fmtInt(r.visitors)}</span>
              <span role="cell" className="r">{dd && <span className={'delta ' + dd.tone}>{dd.text}</span>}</span>
              <span role="cell" className="r num muted rk-hide">{total.visitors ? Math.round((r.visitors / total.visitors) * 100) : 0}%</span>
              <span role="cell" className="rk-hide">{r.visitors > 0 && <Spark values={fromStart(r.series, start)} color={colors.get(r.id) ?? OTHER_COLOR} h={26} />}</span>
            </div>
          )
        })}
      </section>
    </>
  )
}
