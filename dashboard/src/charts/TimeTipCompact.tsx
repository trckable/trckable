// The hover card on a phone: a slim card beside the crosshair. The day and the
// figure on one line, revenue on the next, a thin new/returning bar without its
// counts, the small figures in one tight row, and a note as one truncated line.
import type { Annotation } from '../lib/api'
import { fmtInt } from '../lib/format'
import type { TimeChartProps } from './TimeChart'
import { bucketLabel } from './timeScale'
import './TimeTipCompact.css'

type Detail = ReturnType<NonNullable<TimeChartProps['detail']>>

/** The most figures in the row: any more would not fit the card's width. */
const ROW_MAX = 4

export function CompactTip({ p, i, left, width, detail, notes }: { p: TimeChartProps; i: number; left: number; width: number; detail: Detail; notes: Annotation[] }) {
  const money = p.strip && (p.strip.values[i] ?? 0) > 0 ? p.strip.fmt(p.strip.values[i]) : null
  const cells = (detail?.rows ?? []).slice(0, ROW_MAX)
  return (
    <div className="chart-tip time-tip compact" style={{ left, width }}>
      <div className="ct-line">
        <b className="ct-date">{bucketLabel(p.labels[i], p.bucket, true)}</b>
        <span title={p.metric}>
          <i style={{ background: 'var(--accent)' }} />
          <b className="num">{fmtInt(p.values[i] ?? 0)}</b>
        </span>
      </div>
      {money && (
        <div className="ct-line money">
          <span>
            <i style={{ background: 'var(--money)' }} />
            {p.strip?.label}
          </span>
          <b className="num">{money}</b>
        </div>
      )}
      {detail?.splits?.map((sp) => (
        <span className="ct-split-bar" key={sp.aLabel + sp.bLabel} aria-hidden="true">
          <span style={{ width: `${(sp.a / Math.max(1, sp.a + sp.b)) * 100}%`, background: sp.tone ?? 'var(--accent)' }} />
        </span>
      ))}
      {cells.length > 0 && (
        <div className="ct-tiny">
          {cells.map((c) => (
            <span key={c.label}>
              <b className="num">{c.value}</b>
              <em>{c.short ?? c.label}</em>
            </span>
          ))}
        </div>
      )}
      {notes.map((note) => (
        <div className="tip-note-line" key={note.id}>
          <i />
          <span>{note.text}</span>
        </div>
      ))}
    </div>
  )
}
