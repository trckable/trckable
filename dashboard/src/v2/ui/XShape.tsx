// The shape of the period: people over time as one line over a faint fill, with its top, middle and bottom on the left
// and three times underneath, and the period before as a dashed line beside it (one key, and a hover that reads both
// figures and the change). A drawing of what the table below adds up to, not a chart to read values from.
import { useState } from 'react'
import { copy as briefing } from '../briefing/copy'
import { capital, pairAt, readOf } from '../briefing/compare'
import { fmtInt } from '../../lib/format'
import '../briefing/compareLine.css'
import { ChartControls } from './ChartControls'
import type { Shape } from '../explore/types'

const W = 520
const H = 130

export function XShape({ shape, site }: { shape: Shape; site: { created_at?: number } }) {
  const { pts, before } = shape
  const [at, setAt] = useState<number | null>(null)
  const was = before?.vals ?? []
  const top = Math.max(1, ...pts, ...was)
  const mx = top * 1.12
  const x = (i: number) => (W * i) / (pts.length - 1)
  const y = (v: number) => H - 4 - ((H - 12) * v) / mx
  const path = (vs: number[]) => vs.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const line = path(pts)
  const pair = at === null ? null : pairAt(before, pts[at], at, pts.length)
  return (
    <>
      <ChartControls site={site} why={shape.why} />
      <div className="shp">
      <div className="yl">
        <span>{fmtInt(top)}</span>
        <span>{fmtInt(top / 2)}</span>
        <span>{fmtInt(0)}</span>
      </div>
      <div className="sv">
        {before && (
          <span className="chkey shk" aria-hidden="true">
            <span data-line="now">{briefing.legendNow}</span>
            <span data-line="before">{capital(before.name)}</span>
          </span>
        )}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setAt(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1)))))
          }}
          onPointerLeave={() => setAt(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1="0" x2={W} y1={y(top * t).toFixed(1)} y2={y(top * t).toFixed(1)} stroke="var(--mk-grid)" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`0,${H} ${line} ${W},${H}`} fill="var(--mk-areafill2)" />
          {before && <polyline className="shbefore" points={path(was.slice(0, pts.length))} fill="none" stroke="var(--mk-muted)" strokeWidth="1.25" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" opacity=".8" vectorEffect="non-scaling-stroke" />}
          <polyline points={line} fill="none" stroke="var(--mk-lime)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {at !== null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="var(--mk-text)" strokeOpacity=".35" vectorEffect="non-scaling-stroke" />}
        </svg>
        {at !== null && pair && (
          <div className="shtip" role="status" style={{ left: `${(at / (pts.length - 1)) * 100}%` }} data-edge={at / (pts.length - 1) > 0.4 ? 'r' : 'l'}>
            {readOf(shape.names[at], pts[at], before?.name ?? null, pair.was, pair.delta)}
          </div>
        )}
        <div className="xl">
          {shape.x.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
      </div>
    </>
  )
}
