// Every site's visitors over the period, stacked, each in its own colour (a
// site's colour follows the site: allSitesColors.ts). Point at a day to read
// each site's share of it.
import { useState } from 'react'
import type { SiteRow } from '../lib/api'
import { fmtInt } from '../lib/format'
import { bandsOf } from './allSitesColors'
import { copy } from './allSitesCopy'

/** The day so many days before today, as "Sep 25". */
function dayLabel(ago: number) {
  const d = new Date(Date.now() - ago * 864e5)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function Stacked({ rows, days, colors }: { rows: SiteRow[]; days: number; colors: Map<string, string> }) {
  const [at, setAt] = useState<number | null>(null)
  const n = Math.max(0, ...rows.filter((r) => r.series?.some((v) => v > 0)).map((r) => r.series?.length ?? 0))
  if (!n) return <div className="all-chart-empty faint">{copy.empty}</div>
  const W = 640
  const H = 180
  // Bottom-up: the biggest site sits at the bottom, the smaller ones on top.
  const order = bandsOf(rows, colors, n)
  const sums = Array.from({ length: n }, (_, i) => order.reduce((a, b) => a + b.series[i], 0))
  const max = Math.max(1, ...sums)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const y = (v: number) => H - (v / max) * (H - 8)
  const base = new Array<number>(n).fill(0)
  const bands = order.map((b) => {
    const lo = [...base]
    const hi = base.map((v, i) => v + b.series[i])
    hi.forEach((v, i) => (base[i] = v))
    const top = hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
    const bottom = lo.map((_, i) => `L${x(n - 1 - i).toFixed(1)} ${y(lo[n - 1 - i]).toFixed(1)}`).join('')
    return { b, d: top + bottom + 'Z', line: top }
  })
  const step = days / n // days per point: a day, or a week for 12 months
  const when = (i: number) => dayLabel(Math.round((n - 1 - i) * step))
  const name = (label: string) => label || copy.other
  return (
    <div className="all-chart" onMouseLeave={() => setAt(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="all-chart-svg"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
        }}
        role="img"
        aria-label={copy.label}
      >
        {bands.map(({ b, d, line }) => (
          <g key={b.key}>
            <path d={d} fill={b.color} fillOpacity="0.16" />
            <path d={line} fill="none" stroke={b.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {at !== null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="var(--text-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="all-chart-axis faint">
        <span>{when(0)}</span>
        <span>{when(n - 1)}</span>
      </div>
      {at !== null && (
        <div className="all-chart-tip" style={{ left: `${(x(at) / W) * 100}%` }}>
          <b>{when(at)}</b>
          {order.map((b) => (
            <span key={b.key}>
              <i style={{ background: b.color }} />
              {name(b.label)}
              <em>{fmtInt(b.series[at])}</em>
            </span>
          ))}
          <span className="sum">
            {copy.all} <em>{fmtInt(sums[at] ?? 0)}</em>
          </span>
        </div>
      )}
      <div className="all-legend">
        {order.map((b) => (
          <span key={b.key}>
            <i style={{ background: b.color }} />
            {name(b.label)}
          </span>
        ))}
      </div>
    </div>
  )
}
