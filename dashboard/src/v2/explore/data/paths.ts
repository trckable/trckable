// How visitors move through the site, drawn: each of the busiest routes is a soft band through up to three steps, ending at "Left"
// where the visit stopped. Pure: paths.test.ts.
import type { PathRoute } from '../types'

/** The columns of the flow: the first, second and third page of a visit. */
export const STEPS = 3
/** The routes the flow draws. */
export const FLOW_ROUTES = 8
const GAP = 14
const NODE = 8
const MIN = 2

export const keyOf = (r: PathRoute): string => r.steps.join('\n')

export interface FlowNode {
  key: string
  col: number
  /** The page, or null for "Left". */
  page: string | null
  visits: number
  x: number
  y: number
  h: number
}

export interface FlowBand {
  key: string
  steps: string[]
  visits: number
  /** One ribbon between each two steps of the route. */
  d: string[]
}

export interface Flow {
  /** How many columns the busiest routes reach. */
  cols: number
  nodes: FlowNode[]
  bands: FlowBand[]
}

/** Where a route goes: its pages, then "Left" (null) when the visit ended before the last column. */
const stops = (r: PathRoute): (string | null)[] => (r.steps.length < STEPS ? [...r.steps, null] : r.steps)

const ribbon = (x0: number, y0: number, x1: number, y1: number, h: number): string => {
  const m = (x0 + x1) / 2
  return `M${x0},${y0}C${m},${y0} ${m},${y1} ${x1},${y1}V${y1 + h}C${m},${y1 + h} ${m},${y0 + h} ${x0},${y0 + h}Z`
}

/** The flow of the busiest routes in a box of this size: every band as thick as its visits, one scale for all columns. */
export function layoutFlow(all: PathRoute[], width: number, height: number): Flow {
  const routes = all.slice(0, FLOW_ROUTES)
  if (routes.length === 0 || width <= NODE * 2) return { cols: 0, nodes: [], bands: [] }
  const seqs = routes.map(stops)
  const cols = Math.max(...seqs.map((q) => q.length))
  const order: string[][] = Array.from({ length: STEPS }, () => [])
  const total = new Map<string, number>()
  const id = (col: number, page: string | null) => `${col}|${page ?? ''}`
  seqs.forEach((seq, i) => {
    seq.forEach((page, col) => {
      const k = id(col, page)
      if (!total.has(k)) order[col].push(k)
      total.set(k, (total.get(k) ?? 0) + routes[i].visits)
    })
  })
  // "Left" stands last in its column.
  for (const col of order) col.sort((a, b) => Number(a.endsWith('|')) - Number(b.endsWith('|')))
  const scale = Math.min(...order.filter((c) => c.length > 0).map((c) => (height - GAP * (c.length - 1)) / c.reduce((n, k) => n + (total.get(k) ?? 0), 0)))
  const thick = (v: number) => Math.max(MIN, v * scale)
  const colX = (col: number) => (col * (width - NODE)) / (cols - 1)
  // A node is as tall as the bands that pass through it.
  const high = new Map<string, number>()
  seqs.forEach((seq, i) => seq.forEach((page, col) => high.set(id(col, page), (high.get(id(col, page)) ?? 0) + thick(routes[i].visits))))
  const at = new Map<string, FlowNode>()
  order.forEach((col, c) => {
    let y = 0
    for (const k of col) {
      const v = total.get(k) ?? 0
      const h = high.get(k) ?? MIN
      const page = k.slice(k.indexOf('|') + 1) || null
      at.set(k, { key: k, col: c, page, visits: v, x: colX(c), y, h })
      y += h + GAP
    }
  })
  // Where in its node the next band of each stands.
  const used = new Map<string, number>()
  const bands = routes.map((r, i): FlowBand => {
    const seq = seqs[i]
    const h = thick(r.visits)
    const slots = seq.map((page, col) => {
      const k = id(col, page)
      const n = at.get(k) as FlowNode
      const off = used.get(k) ?? 0
      used.set(k, off + h)
      return n.y + off
    })
    const d = slots.slice(1).map((y1, j) => ribbon((at.get(id(j, seq[j])) as FlowNode).x + NODE, slots[j], (at.get(id(j + 1, seq[j + 1])) as FlowNode).x, y1, h))
    return { key: keyOf(r), steps: r.steps, visits: r.visits, d }
  })
  return { cols, nodes: [...at.values()], bands }
}

export const NODE_WIDTH = NODE
