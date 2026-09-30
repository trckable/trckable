// A vertical funnel: each step a row (its number, its name, how many, and what
// share of the step before), a bar under it whose width is its share of the
// first step, and between two steps what was lost there. Plain markup, not
// SVG, so the names stay real text and the chart reads the same at 375 px as
// on a wide screen. Every number is written out: no tooltip to reach.
import './funnel.css'

export interface FunnelRow {
  label: string
  /** The full name, when the label is cut short by the width. */
  title?: string
  count: string
  /** Share of the first step, 0 to 1: the bar's width. */
  share: number
  /** "5.9%": the share of the step before. Not on the first step. */
  of?: string
  /** What was lost on the way here, already worded. Not on the first step. */
  drop?: string
}

// Fewer steps get taller bars, so two steps fill a card as well as six do.
const BAR_HEIGHTS = [34, 34, 34, 28, 24, 20, 20] // by the number of steps; more get 16
const barHeight = (n: number) => BAR_HEIGHTS[n] ?? 16

const pct = (share: number) => `${Math.max(2, Math.min(100, share * 100)).toFixed(2)}%`

export function FunnelRows({ rows, color, label }: { rows: FunnelRow[]; color: string; label: string }) {
  return (
    <ol className="fr" aria-label={label} style={{ ['--fr-color' as string]: color, ['--fr-h' as string]: `${barHeight(rows.length)}px` }}>
      {rows.map((r, i) => (
        <li key={i} className="fr-step">
          {r.drop && (
            <p className="fr-drop num">{r.drop}</p>
          )}
          <div className="fr-row">
            <span className="fr-n num faint" aria-hidden="true">
              {i + 1}
            </span>
            <span className="fr-label" title={r.title ?? r.label}>
              {r.label}
            </span>
            <b className="fr-count num">{r.count}</b>
            <span className="fr-of num faint">{r.of}</span>
          </div>
          <span className="fr-bar" aria-hidden="true">
            <i style={{ width: pct(r.share) }} />
          </span>
        </li>
      ))}
    </ol>
  )
}
