// Every site's visitors over the period as one line each, in the site's own
// colour (it follows the site: allSitesColors.ts). Two quiet gridlines with
// their values, a date label about each week. Point at a day, or tap it, for a
// card listing each site; tap a name in the key to hide that site's line.
import { ChartLine } from 'lucide-react'
import { useState } from 'react'
import type { SiteRow } from '../lib/api'
import { fmtInt } from '../lib/format'
import { useDraw } from '../lib/motion'
import { Card } from '../kit/Card'
import { bandsOf } from './allSitesColors'
import { copy } from './allSitesCopy'
import { tag } from '../i18n'
import '../kit/draw.css'

/** The day so many days before today, as "Sep 25". */
function dayLabel(ago: number) {
  const d = new Date(Date.now() - ago * 864e5)
  return d.toLocaleDateString(tag, { day: 'numeric', month: 'short' })
}

const W = 640
const H = 160

/** The points that carry a date label: about one a week, never more than six. */
export function weekTicks(n: number, step: number): number[] {
  const every = Math.max(1, Math.round(7 / step))
  const ticks: number[] = []
  for (let i = n - 1; i >= 0; i -= every) ticks.unshift(i)
  const stride = Math.ceil(ticks.length / 6)
  return ticks.filter((_, k) => (ticks.length - 1 - k) % stride === 0)
}

export function SiteLines({ rows, days, colors, total, start = 0 }: { rows: SiteRow[]; days: number; colors: Map<string, string>; total: number; start?: number }) {
  const [at, setAt] = useState<number | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const draw = useDraw()
  const points = Math.max(0, ...rows.filter((r) => r.series?.some((v) => v > 0)).map((r) => r.series?.length ?? 0))
  const n = points - start
  const title = copy.visitors
  if (!n) return <Card icon={<ChartLine size={15} strokeWidth={1.8} />} title={title} className="all-chart-card"><div className="all-chart-empty faint">{copy.empty}</div></Card>
  const bands = bandsOf(rows.map((r) => ({ ...r, series: r.series?.slice(start) ?? null })), colors, n)
  const shown = bands.filter((b) => !hidden.has(b.key))
  const max = Math.max(1, ...shown.flatMap((b) => b.series))
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const y = (v: number) => H - 4 - (v / max) * (H - 12)
  const step = days / points
  const when = (i: number) => dayLabel(Math.round((n - 1 - i) * step))
  const name = (label: string) => label || copy.other
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }
  const sum = (i: number) => shown.reduce((a, b) => a + b.series[i], 0)
  return (
    <Card icon={<ChartLine size={15} strokeWidth={1.8} />} title={title} status={fmtInt(total)} className="all-chart-card">
      <div className="all-chart" onPointerMove={pick} onPointerDown={pick} onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="all-chart-svg" role="img" aria-label={copy.label}>
          {[max, max / 2].map((v) => (
            <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} className="all-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {shown.map((b, k) => (
            <path key={b.key} className={draw} pathLength="1" style={{ '--i': k } as React.CSSProperties} d={b.series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')} fill="none" stroke={b.color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
              {i === 0 && start > 0 ? copy.since(when(0)) : when(i)}
            </span>
          ))}
        </div>
        {at !== null && (
          <div className="all-chart-tip" style={{ left: `${Math.min(80, Math.max(20, (x(at) / W) * 100))}%` }}>
            <b>{when(at)}</b>
            {shown.map((b) => (
              <span key={b.key}>
                <i style={{ background: b.color }} />
                {name(b.label)}
                <em>{fmtInt(b.series[at])}</em>
              </span>
            ))}
            <span className="sum">
              {copy.all} <em>{fmtInt(sum(at))}</em>
            </span>
          </div>
        )}
      </div>
      <div className="all-legend">
        {bands.map((b) => (
          <span key={b.key}>
            <button type="button" aria-pressed={!hidden.has(b.key)} onClick={() => toggle(b.key)}>
              <i style={{ background: b.color }} />
              {name(b.label)}
            </button>
          </span>
        ))}
      </div>
    </Card>
  )
}
