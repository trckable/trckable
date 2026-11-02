// Rows × columns of cells shaded by one hue in a few steps (weekday × hour).
// Every cell names its row, column and count on hover; the key under the grid
// says which way is more.
import { useState } from 'react'
import { Tip } from './Tip'
import { useWidth } from './useWidth'

export const HEAT_LEVELS = 4

/** A cell's own shade: the curve keeps the busy hours standing out instead of a wall of bright cells. */
export const heatShade = (n: number, peak: number, color: string) =>
  n === 0 || peak === 0 ? 'var(--grid)' : `color-mix(in srgb, ${color} ${Math.round(6 + (n / peak) ** 2.4 * 94)}%, var(--sunken))`

const LABEL_W = 34
const AXIS_H = 18

export function HeatGrid(p: {
  cells: number[][] // [row][col]
  rows: string[]
  cols: string[]
  colTicks: number[] // which columns get a label
  color: string
  label: string
  tip: (row: number, col: number, n: number) => string
}) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const [at, setAt] = useState<{ r: number; c: number } | null>(null)
  const peak = Math.max(0, ...p.cells.flat())
  const nc = p.cols.length
  const cw = (w - LABEL_W) / Math.max(1, nc)
  const ch = Math.min(22, Math.max(14, cw * 1.6))
  const h = ch * p.rows.length + AXIS_H
  return (
    <div ref={ref} className="kit-chart">
      <svg width={w} height={h} role="img" aria-label={p.label} className="kit-svg" onPointerLeave={() => setAt(null)}>
        {p.rows.map((row, r) => (
          <g key={row}>
            <text x={LABEL_W - 6} y={r * ch + ch / 2 + 3.5} textAnchor="end" className="kit-axis">
              {row}
            </text>
            {(p.cells[r] ?? []).map((n, c) => (
              <rect
                key={c}
                x={LABEL_W + c * cw + 1.5}
                y={r * ch + 1.5}
                width={Math.max(1, cw - 3)}
                height={ch - 3}
                rx={4}
                className="kit-heat"
                style={{ animationDelay: `${c * 22}ms` }}
                fill={heatShade(n, peak, p.color)}
                stroke={at && at.r === r && at.c === c ? 'var(--text)' : 'none'}
                onPointerEnter={() => setAt({ r, c })}
              />
            ))}
          </g>
        ))}
        {p.colTicks.map((c) => (
          <text key={c} x={LABEL_W + c * cw + cw / 2} y={h - 4} textAnchor="middle" className="kit-axis">
            {p.cols[c]}
          </text>
        ))}
      </svg>
      <Tip width={w} at={at ? { x: LABEL_W + at.c * cw + cw / 2, y: at.r * ch, body: <b className="num">{p.tip(at.r, at.c, p.cells[at.r]?.[at.c] ?? 0)}</b> } : null} />
    </div>
  )
}

/** The key for a heat grid: fewer → more in the grid's own steps. */
export function HeatKey({ color, fewer, more }: { color: string; fewer: string; more: string }) {
  return (
    <div className="kit-legend kit-heatkey">
      <span>{fewer}</span>
      {Array.from({ length: HEAT_LEVELS + 1 }, (_, l) => (
        <i key={l} className="swatch" style={{ background: heatShade(l, HEAT_LEVELS, color) }} aria-hidden="true" />
      ))}
      <span>{more}</span>
    </div>
  )
}
