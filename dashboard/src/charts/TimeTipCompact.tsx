// The hover card on a phone: a slim card beside the crosshair. The day and the
// figure on one line, revenue on the next, a thin new/returning bar without its
// counts, the small figures in one tight row, and a note as one truncated line.
import type { Annotation } from '../lib/api'
import { fmtInt } from '../lib/format'
import { timeCopy } from './copy'
import type { TimeChartProps } from './TimeChart'
import { bucketLabel } from './timeScale'
import './TimeTipCompact.css'

type Detail = ReturnType<NonNullable<TimeChartProps['detail']>>

function Figure({ label, color, value }: { label: string; color: string; value: string | null }) {
  return (
    <span title={label}>
      <i style={{ background: color }} />
      {value === null ? <em className="ct-none">{timeCopy.noSales}</em> : <b className="num">{value}</b>}
    </span>
  )
}

/** The most figures in the row: any more would not fit the card's width. */
const ROW_MAX = 4

export function CompactTip({ p, i, left, width, detail, notes }: { p: TimeChartProps; i: number; left: number; width: number; detail: Detail; notes: Annotation[] }) {
  const fmt = p.fmt ?? fmtInt
  const paint = p.tone === 'money' ? 'var(--money)' : 'var(--accent)'
  const rev = p.tone === 'money' ? undefined : p.revenue
  const sold = rev ? (rev.values[i] ?? 0) > 0 : false
  const sales = p.saleNote?.(i)
  const cells = (detail?.rows ?? []).slice(0, ROW_MAX)
  return (
    <div className="chart-tip time-tip compact" style={{ left, width }}>
      <div className="ct-line">
        <b className="ct-date">{bucketLabel(p.labels[i], p.bucket, true)}</b>
        <Figure label={p.metric} color={paint} value={p.tone === 'money' && !p.values[i] ? null : fmt(p.values[i] ?? 0)} />
      </div>
      {rev && (
        <div className="ct-line">
          <span>
            <i style={{ background: 'var(--money)' }} />
            {rev.label}
          </span>
          {sold ? <b className="num">{rev.fmt(rev.values[i])}</b> : <em className="ct-none">{timeCopy.noSales}</em>}
        </div>
      )}
      {sales && <span className="ct-sub num">{sales}</span>}
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
