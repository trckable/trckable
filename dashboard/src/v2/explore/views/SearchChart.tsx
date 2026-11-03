// What Google showed and what was clicked, a day each: two smooth lines, each on its own scale (a click is a handful of
// impressions), with the day under the pointer read out above them.
import { useState } from 'react'
import { fmtDay } from '../../../lib/dates'
import { fmtInt } from '../../../lib/format'
import { segments, type Pt } from '../../ui/smooth'
import { copy } from '../copy'
import type { SearchDay } from '../types'
import { fmtK } from './numbers'

const W = 600
const H = 150
const PAD = 8

function line(vals: number[]): { d: string; pts: Pt[] } {
  const max = Math.max(1, ...vals)
  const pts: Pt[] = vals.map((v, i) => [vals.length < 2 ? W / 2 : (i / (vals.length - 1)) * W, H - PAD - (v / max) * (H - 2 * PAD)])
  const segs = segments(pts)
  return { d: segs.length ? `M${pts[0][0]},${pts[0][1]}${segs.join('')}` : '', pts }
}

export function SearchChart({ days }: { days: SearchDay[] }) {
  const [at, setAt] = useState<number | null>(null)
  if (days.length < 2) return null
  const clicks = line(days.map((d) => d.clicks))
  const impr = line(days.map((d) => d.impr))
  const shown = days[at ?? days.length - 1]
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.max(0, Math.min(days.length - 1, Math.round(((e.clientX - r.left) / r.width) * (days.length - 1)))))
  }
  return (
    <div className="xschart" data-xschart="1" role="img" aria-label={copy.searchDays}>
      <div className="xschart-read">
        <span className="xschart-day">{fmtDay(shown.date)}</span>
        <span className="xschart-k"><i style={{ background: 'var(--mk-lime)' }} />{copy.heads.clicks} <b>{fmtInt(shown.clicks)}</b></span>
        <span className="xschart-k"><i style={{ background: 'var(--mk-blue)' }} />{copy.impressions} <b>{fmtK(shown.impr)}</b></span>
      </div>
      <div className="xschart-plot" onPointerMove={move} onPointerLeave={() => setAt(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={impr.d} fill="none" stroke="var(--mk-blue)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={clicks.d} fill="none" stroke="var(--mk-lime)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {at !== null && <line x1={clicks.pts[at][0]} x2={clicks.pts[at][0]} y1="0" y2={H} stroke="var(--mk-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {at !== null && <i className="xschart-dot" style={{ left: `${(clicks.pts[at][0] / W) * 100}%`, top: `${(clicks.pts[at][1] / H) * 100}%`, background: 'var(--mk-lime)' }} />}
        {at !== null && <i className="xschart-dot" style={{ left: `${(impr.pts[at][0] / W) * 100}%`, top: `${(impr.pts[at][1] / H) * 100}%`, background: 'var(--mk-blue)' }} />}
      </div>
      <div className="xschart-axis">
        <span>{fmtDay(days[0].date)}</span>
        <span>{fmtDay(days[days.length - 1].date)}</span>
      </div>
    </div>
  )
}
