// The revenue plot under the visitors plot: its own labelled axis in the left
// margin ($0, half, top), money columns, and the same x-axis and crosshair as
// the plot above. Its own scale, never a second axis on one plot. A day with
// no sales draws nothing, today is striped, the biggest sale is labelled, and
// a period with no sales says so once, quietly.
import { useMemo } from 'react'
import { useTween } from '../lib/motion'
import { Columns } from './Columns'
import { SPLIT_PLOT, hasSales, columnHeight, columnWidth, moneyScale } from './moneyPlot'
import { PeakLabel } from './PeakLabel'
import { CHART_MS, PAD_L } from './plot'
import { peakIndex } from './timeScale'

interface Props {
  values: number[]
  label: string
  /** What a period with no sales says. */
  none: string
  fmt: (n: number) => string
  axis: (n: number) => string
  /** The chart's paint (TimeDefs) and the pieces of its geometry. */
  id: string
  x: (i: number) => number
  w: number
  /** Where the plot starts. */
  top: number
  hover: number | null
  partialLast?: boolean
  /** Replay is playing, dragged or has a day picked: the far side greys. */
  dim: boolean
  /** No label while a day is being read. */
  labelled: boolean
}

export function RevenuePlot(p: Props) {
  const n = p.values.length
  const scale = useMemo(() => moneyScale(p.values), [p.values])
  const max = useTween(scale.max, CHART_MS)
  const vals = useTween(p.values, CHART_MS)
  const plotW = p.w - PAD_L
  const bw = columnWidth(plotW, n)
  const base = p.top + SPLIT_PLOT
  const y = (v: number) => base - (v / (max || 1)) * SPLIT_PLOT
  const sold = hasSales(p.values)
  const peak = peakIndex(p.values)
  const slot = plotW / Math.max(1, n)
  const cols = { x: p.x, base, h: SPLIT_PLOT, max, w: bw }
  return (
    <g aria-hidden="true">
      <text x={PAD_L + 2} y={p.top - 5} fontSize="11" fill="var(--text-3)">
        {p.label}
      </text>
      {scale.ticks.map((t) => (
        <g key={t}>
          {t > 0 && <line x1={PAD_L} x2={p.w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray="2 4" />}
          <text x={0} y={y(t) + 4} className="num" fontSize="11" fill="var(--text-3)">
            {p.axis(t)}
          </text>
        </g>
      ))}
      <line x1={PAD_L} x2={p.w} y1={base} y2={base} stroke="var(--border)" />
      {!sold && (
        <text x={PAD_L + plotW / 2} y={p.top + SPLIT_PLOT / 2 + 4} textAnchor="middle" fontSize="12.5" fill="var(--text-3)">
          {p.none}
        </text>
      )}
      {p.hover != null && <rect x={p.x(p.hover) - Math.min(slot, bw + 18) / 2} y={p.top} width={Math.min(slot, bw + 18)} height={SPLIT_PLOT} rx="6" fill="var(--text)" fillOpacity="0.04" />}
      <g clipPath={`url(#${p.id}-plot)`}>
        {p.dim && <Columns {...cols} values={vals} hover={null} fill="" stripe="" grey />}
        <g mask={`url(#${p.id}-dim)`}>
          <Columns {...cols} values={vals} hover={p.hover} partialLast={p.partialLast} fill={p.id + '-money'} stripe={p.id + '-stripe'} />
        </g>
      </g>
      {p.labelled && peak >= 0 && <PeakLabel x={p.x(peak)} y={base - columnHeight(vals[peak] ?? 0, max, SPLIT_PLOT)} w={p.w} text={p.fmt(p.values[peak])} padL={PAD_L} dot={false} />}
    </g>
  )
}
