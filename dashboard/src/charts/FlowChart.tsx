// Where visits go next: columns of pages (entry, 2nd, 3rd) joined by ribbons as
// thick as the visits that took that step. A ribbon takes the colour of the page
// it leaves; real pages are accent nodes, "Other pages" a hatched one no taller
// than the busiest page, "Left the site" a small red one. Pointing at a node or
// a ribbon lights its path and quiets the rest. On a phone the chart keeps its
// width and scrolls sideways inside its own box.
import { useId, useState } from 'react'
import { flowInputs, labelled, pageColors, type FlowCol } from './flowView'
import { flowLayout, type FlowBand, type FlowBox } from './scale'
import { Tip } from './Tip'
import { useWidth } from './useWidth'
import './flow.css'

export type { FlowCol } from './flowView'

const BOX_W = 12
const PAD_T = 24
const MIN_W = 560
const LABEL_ROOM = 150
const CHAR_W = 6.7 // a 11 px mono character

const bandClass = (lit: boolean, hovering: boolean) => {
  if (!lit) return 'kit-band dim'
  return hovering ? 'kit-band lit' : 'kit-band'
}

type Hot = { kind: 'node'; col: number; key: string } | { kind: 'band'; i: number } | null

export function FlowChart(p: {
  cols: FlowCol[][]
  heads: string[] // a title over each column
  links: { col: number; from: string; to: string; value: number }[]
  label: string
  fmt: (n: number) => string
  boxTip: (col: number, box: FlowCol) => string
  bandTip: (from: FlowCol, to: FlowCol, value: number) => string
  height?: number
}) {
  const { ref, w: room } = useWidth<HTMLDivElement>()
  const hatch = 'hatch' + useId().replace(/:/g, '')
  const [hot, setHot] = useState<Hot>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const w = Math.max(room, MIN_W)
  const h = p.height ?? 250
  const { boxes, bands } = flowLayout(flowInputs(p.cols), p.links, h - PAD_T, 8)
  const colors = pageColors(p.cols)
  const span = (w - BOX_W - LABEL_ROOM) / Math.max(1, p.cols.length - 1)
  const bx = (col: number) => col * span
  const byKey = (b: FlowBox): FlowCol => p.cols[b.col]?.find((c) => c.key === b.key) ?? { key: b.key, label: b.key, value: b.value, kind: 'page' }
  const named = p.cols.map((_, c) => {
    const at = boxes.filter((b) => b.col === c)
    const shown = labelled(at)
    return new Map(at.map((b, i) => [b.key, shown[i]]))
  })

  const lit = (b: FlowBand, i: number) => {
    if (!hot) return true
    if (hot.kind === 'band') return hot.i === i
    return (b.from.col === hot.col && b.from.key === hot.key) || (b.to.col === hot.col && b.to.key === hot.key)
  }
  const nodeLit = (b: FlowBox) => {
    if (!hot) return true
    if (hot.kind === 'node') return (hot.col === b.col && hot.key === b.key) || bands.some((x, i) => lit(x, i) && ((x.from === b) || (x.to === b)))
    return bands.some((x, i) => lit(x, i) && (x.from === b || x.to === b))
  }
  const ribbonColor = (b: FlowBand) => {
    const src = byKey(b.from)
    return src.kind === 'page' ? (colors.get(src.key) ?? 'var(--text-3)') : 'var(--text-3)'
  }
  const fillOf = (c: FlowCol) => {
    if (c.kind === 'other') return `url(#${hatch})`
    return c.kind === 'exit' ? 'var(--down)' : 'var(--accent)'
  }
  const band = (b: FlowBand) => {
    const x0 = bx(b.from.col) + BOX_W
    const x1 = bx(b.to.col)
    const m = (x0 + x1) / 2
    const t0 = PAD_T + b.y0
    const t1 = PAD_T + b.y1
    return `M${x0},${t0}C${m},${t0} ${m},${t1} ${x1},${t1}L${x1},${t1 + b.h1}C${m},${t1 + b.h1} ${m},${t0 + b.h0} ${x0},${t0 + b.h0}Z`
  }
  return (
    <div ref={ref} className="kit-chart kit-flow">
      {/* It scrolls sideways, so a keyboard has to be able to reach it (WCAG scrollable regions). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="kit-flow-box" tabIndex={0} role="group" aria-label={p.label}>
        <div className="kit-flow-in" style={{ width: w }}>
          <svg width={w} height={h} role="img" aria-label={p.label} className="kit-svg" onPointerLeave={() => { setHot(null); setTip(null) }}>
            <defs>
              <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--sunken)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--text-3)" strokeWidth="1.5" opacity="0.6" />
              </pattern>
            </defs>
            {p.heads.map((t, c) => (
              <text key={t} x={bx(c)} y={12} className="kit-axis">
                {t}
              </text>
            ))}
            {bands.map((b, i) => (
              <path
                key={`${b.from.col}${b.from.key}>${b.to.key}`}
                d={band(b)}
                fill={ribbonColor(b)}
                className={bandClass(lit(b, i), hot !== null)}
                onPointerEnter={() => {
                  setHot({ kind: 'band', i })
                  setTip({ x: (bx(b.from.col) + bx(b.to.col)) / 2 + BOX_W, y: PAD_T + b.y0, text: p.bandTip(byKey(b.from), byKey(b.to), b.value) })
                }}
              />
            ))}
            {boxes.map((b) => {
              const c = byKey(b)
              const off = !nodeLit(b)
              return (
                <g
                  key={`${b.col}${b.key}`}
                  className={off ? 'kit-node dim' : 'kit-node'}
                  onPointerEnter={() => {
                    setHot({ kind: 'node', col: b.col, key: b.key })
                    setTip({ x: bx(b.col), y: PAD_T + b.y, text: p.boxTip(b.col, c) })
                  }}
                >
                  <rect x={bx(b.col)} y={PAD_T + b.y} width={BOX_W} height={b.h} rx={3} fill={fillOf(c)} fillOpacity={c.kind === 'exit' ? 0.6 : 1} stroke={c.kind === 'other' ? 'var(--border-2)' : 'none'} />
                </g>
              )
            })}
            {boxes.map((b) => {
              const c = byKey(b)
              if (!named[b.col]?.get(b.key) && !(hot?.kind === 'node' && hot.col === b.col && hot.key === b.key)) return null
              const text = c.label
              const count = p.fmt(c.value)
              const cw = (text.length + 1 + count.length) * CHAR_W + 12
              const x = bx(b.col) + BOX_W + 5
              const y = PAD_T + b.y + Math.min(b.h, 14) / 2
              return (
                <g key={`l${b.col}${b.key}`} className={nodeLit(b) ? 'kit-flow-chip' : 'kit-flow-chip dim'} pointerEvents="none">
                  <rect x={x} y={y - 9} width={cw} height={18} rx={5} />
                  <text x={x + 6} y={y + 3.5} className="kit-flow-label">
                    {text} <tspan className="kit-flow-count">{count}</tspan>
                  </text>
                </g>
              )
            })}
          </svg>
          <Tip width={w} at={tip ? { x: tip.x, y: tip.y, body: <b className="num">{tip.text}</b> } : null} />
        </div>
      </div>
    </div>
  )
}
