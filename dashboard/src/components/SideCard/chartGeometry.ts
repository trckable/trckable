// The small chart on a card, as numbers: a line over its area with the moment
// marked, a dashed level (what is usual, what it was before, the goal), or bars
// for money. Pure, so it can be tested; Chart.tsx only draws it.
export const CHART_W = 280
export const CHART_H = 46
const PAD = 3

export interface ChartSpec {
  values: readonly number[]
  /** A dashed level: what is usual, or what it was before. */
  base?: number
  /** A dashed level the line is climbing to. */
  goal?: number
  /** Index of the moment to mark with a dot. */
  hl?: number
  /** Money: one bar a value, an empty one a thin grey line. */
  bars?: boolean
  /** A spike dwarfs what is usual: a square root keeps the usual level in view. */
  soft?: boolean
}

export interface Bar {
  x: number
  y: number
  w: number
  h: number
  empty: boolean
}

export interface Geometry {
  line: string
  area: string
  base?: number
  goal?: number
  point?: [number, number]
  bars?: Bar[]
}

const r = (n: number) => Math.round(n * 10) / 10

/** The geometry of a chart, or null when there is nothing to draw (fewer than two values). */
export function geometry(spec: ChartSpec): Geometry | null {
  const { values, bars } = spec
  if (values.length < 2 || values.every((v) => !Number.isFinite(v))) return null
  const t = (v: number) => (spec.soft ? Math.sqrt(Math.max(0, v)) : v)
  const vs = values.map(t)
  const top = Math.max(...vs, spec.base !== undefined ? t(spec.base) : 0, spec.goal !== undefined ? t(spec.goal) : 0, 1e-9) * 1.08
  const x = (i: number) => (i * CHART_W) / (values.length - 1)
  const y = (v: number) => CHART_H - (v / top) * (CHART_H - 2 * PAD) - PAD
  if (bars) {
    const w = Math.min(20, (CHART_W / values.length) * 0.7)
    return {
      line: '',
      area: '',
      bars: vs.map((v, i) => {
        const empty = v <= 0
        const yy = empty ? CHART_H - 2 : y(v)
        // The first and last bars sit inside the edges.
        const cx = Math.min(Math.max(x(i), w / 2), CHART_W - w / 2)
        return { x: r(cx - w / 2), y: r(yy), w: r(w), h: r(CHART_H - yy), empty }
      }),
    }
  }
  const pts = vs.map((v, i): [number, number] => [r(x(i)), r(y(v))])
  const line = 'M' + pts.map((p) => p.join(' ')).join(' L')
  const hl = spec.hl !== undefined ? pts[spec.hl] : undefined
  return {
    line,
    area: `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H}Z`,
    base: spec.base !== undefined ? r(y(t(spec.base))) : undefined,
    goal: spec.goal !== undefined ? r(y(t(spec.goal))) : undefined,
    point: hl,
  }
}
