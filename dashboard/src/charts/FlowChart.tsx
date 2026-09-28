// Where visits go next: columns of pages (first, second, third) joined by
// bands as thick as the visits that took that step. Ends of visits are grey.
// Hovering a band or a box shows its count.
import { useState } from 'react'
import { flowLayout, type FlowBand, type FlowBox } from './scale'
import { Tip } from './Tip'
import { useWidth } from './useWidth'

export interface FlowCol {
  key: string
  label: string
  value: number
  muted?: boolean // "left the site", "other pages"
}

const BOX_W = 8
const PAD_T = 18

export function FlowChart(p: {
  cols: FlowCol[][]
  heads: string[] // a title over each column
  links: { col: number; from: string; to: string; value: number }[]
  color: string
  label: string
  boxTip: (col: number, box: FlowCol) => string
  bandTip: (from: FlowCol, to: FlowCol, value: number) => string
  height?: number
}) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const h = p.height ?? 230
  const { boxes, bands } = flowLayout(
    p.cols.map((c) => c.map((b) => ({ key: b.key, value: b.value }))),
    p.links,
    h - PAD_T,
  )
  // The last column's names sit to its right, in a margin kept for them.
  const labelRoom = Math.min(110, w * 0.3)
  const span = (w - BOX_W - labelRoom) / Math.max(1, p.cols.length - 1)
  const bx = (col: number) => col * span
  const byKey = (b: FlowBox): FlowCol => p.cols[b.col]?.find((c) => c.key === b.key) ?? { key: b.key, label: b.key, value: b.value }
  const fillOf = (b: FlowBox) => (byKey(b).muted ? 'var(--text-3)' : p.color)
  const band = (b: FlowBand) => {
    const x0 = bx(b.from.col) + BOX_W
    const x1 = bx(b.to.col)
    const m = (x0 + x1) / 2
    const t0 = PAD_T + b.y0
    const t1 = PAD_T + b.y1
    return `M${x0},${t0}C${m},${t0} ${m},${t1} ${x1},${t1}L${x1},${t1 + b.h1}C${m},${t1 + b.h1} ${m},${t0 + b.h0} ${x0},${t0 + b.h0}Z`
  }
  return (
    <div ref={ref} className="kit-chart">
      <svg width={w} height={h} role="img" aria-label={p.label} className="kit-svg" onPointerLeave={() => setTip(null)}>
        {p.heads.map((t, c) => (
          <text key={t} x={bx(c)} y={11} className="kit-axis">
            {t}
          </text>
        ))}
        {bands.map((b) => (
          <path
            key={`${b.from.col}${b.from.key}>${b.to.key}`}
            d={band(b)}
            fill={fillOf(b.to)}
            className="kit-band"
            onPointerEnter={() => setTip({ x: (bx(b.from.col) + bx(b.to.col)) / 2 + BOX_W, y: PAD_T + b.y0, text: p.bandTip(byKey(b.from), byKey(b.to), b.value) })}
          />
        ))}
        {boxes.map((b) => (
          <g key={`${b.col}${b.key}`} onPointerEnter={() => setTip({ x: bx(b.col), y: PAD_T + b.y, text: p.boxTip(b.col, byKey(b)) })}>
            <rect x={bx(b.col)} y={PAD_T + b.y} width={BOX_W} height={b.h} rx={2} fill={fillOf(b)} />
            {b.h >= 12 && (
              <text
                x={bx(b.col) + BOX_W + 4}
                y={PAD_T + b.y + 11}
                className="kit-flow-label"
              >
                {byKey(b).label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <Tip width={w} at={tip ? { x: tip.x, y: tip.y, body: <b className="num">{tip.text}</b> } : null} />
    </div>
  )
}
