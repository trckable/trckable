// The parts a card's dialog is told with: a section, a ranked bar list, a small
// line of the period, one line of what it means. Plain markup in the page's tokens.
import type { ReactNode } from 'react'
import { geometry, type ChartSpec } from '../SideCard/chartGeometry'
import { fmtInt } from '../../lib/format'

/** A titled block of the story. */
export function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cm-part" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export interface BarRow {
  key: string
  label: ReactNode
  n: number
  /** Written as the number is, when it is not a plain count. */
  text?: string
}

/** Ranked rows, each with its number and a bar against the biggest. */
export function Bars({ rows, label }: { rows: BarRow[]; label: string }) {
  const top = Math.max(1, ...rows.map((r) => r.n))
  return (
    <ul className="cm-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key}>
          <span className="cm-row">
            <span className="cm-name">{r.label}</span>
            <b className="num">{r.text ?? fmtInt(r.n)}</b>
          </span>
          <i style={{ width: `${Math.max(3, Math.round((r.n * 100) / top))}%` }} />
        </li>
      ))}
    </ul>
  )
}

/** The period as a small line over its area, the busiest slice marked. A text name for assistive tech; nothing moves with reduced motion. */
export function Spark({ values, label, base, hl }: { values: readonly number[]; label: string; base?: number; hl?: number }) {
  const spec: ChartSpec = { values, base, hl }
  const g = geometry(spec)
  if (!g) return null
  return (
    <figure className="cm-spark">
      <svg viewBox="0 0 280 46" preserveAspectRatio="none" role="img" aria-label={label}>
        {g.base !== undefined && <line className="base" x1="0" x2="280" y1={g.base} y2={g.base} />}
        <path className="ar" d={g.area} />
        <path className="ln" pathLength="1" d={g.line} vectorEffect="non-scaling-stroke" />
      </svg>
      {g.point && <i className="pt" aria-hidden="true" style={{ left: `${(g.point[0] * 100) / 280}%`, top: `${(g.point[1] * 100) / 46}%` }} />}
    </figure>
  )
}

/** The index of the busiest slice, for the mark. */
export const busiest = (values: readonly number[]) => (values.length ? values.indexOf(Math.max(...values)) : undefined)

/** One line of what it means. */
export function Meaning({ children }: { children: ReactNode }) {
  return <p className="cm-meaning muted">{children}</p>
}
