// The main chart's hover card: the day, its figures large, how it compares,
// its note, then the smaller numbers in two columns.
import type { Annotation } from '../lib/api'
import { fmtInt } from '../lib/format'
import { timeCopy } from './copy'
import type { TimeChartProps } from './TimeChart'
import { bucketLabel } from './timeScale'
import './TimeTip.css'
import './Tip.css'

export default function TimeTip({ p, i, left, notes }: { p: TimeChartProps; i: number; left: number; notes: Annotation[] }) {
  const detail = p.detail?.(i) ?? null
  return (
    <div className="chart-tip time-tip" style={{ left }}>
      <div className="ct-head">
        <b>{bucketLabel(p.labels[i], p.bucket, true)}</b>
        {p.partialLast && i === p.values.length - 1 && <span className="ct-live">In progress</span>}
      </div>
      {/* The flag on the axis is a short tag; the whole note is here,
          where there is room to read it. */}
      {notes.map((note) => (
          <div className="tip-note" key={note.id}>
            <span className="ct-label">
              <i />
              {timeCopy.note}
            </span>
            <p>{note.text}</p>
          </div>
        ))}
      <div className="ct-hero">
        <span className="ct-label">
          <i style={{ background: 'var(--accent)' }} />
          {p.metric}
        </span>
        <span className="ct-big num">{fmtInt(p.values[i] ?? 0)}</span>
        {p.ghost && p.ghost[i] !== undefined && (
          <span className="ct-vs num">
            {(() => {
              const a = p.values[i] ?? 0
              const b = p.ghost[i] ?? 0
              const pct = b ? Math.round(((a - b) / b) * 100) : null
              return (
                <>
                  {pct !== null && <em className={pct >= 0 ? 'tone-up' : 'tone-down'}>{`${pct >= 0 ? '↑ ' : '↓ '}${Math.abs(pct)}%`}</em>} vs {fmtInt(b)}
                  {p.ghostLabels?.[i] ? ` on ${bucketLabel(p.ghostLabels[i], p.bucket, true)}` : ''}
                </>
              )
            })()}
          </span>
        )}
      </div>
      {p.strip && (p.strip.values[i] ?? 0) > 0 && (
        <div className="ct-hero money">
          <span className="ct-label">
            <i style={{ background: 'var(--money)' }} />
            {p.strip.label}
          </span>
          <span className="ct-big num">{p.strip.fmt(p.strip.values[i] ?? 0)}</span>
        </div>
      )}
      {p.overlay && (
        <div className="ct-row">
          <span>
            <i style={{ background: p.overlay.color }} />
            {p.overlay.name}
          </span>
          <span className="num">{fmtInt(p.overlay.values[i] ?? 0)}</span>
        </div>
      )}
      {detail?.splits?.map((sp) => {
        const write = sp.fmt ?? fmtInt
        return (
          <div className="ct-split" key={sp.aLabel + sp.bLabel} aria-hidden="true">
            <span className="ct-split-bar">
              <span style={{ width: `${(sp.a / Math.max(1, sp.a + sp.b)) * 100}%`, background: sp.tone ?? 'var(--accent)' }} />
            </span>
            <em>
              <span className="num">{write(sp.a)}</span> {sp.aLabel}
            </em>
            <em className="right">
              <span className="num">{write(sp.b)}</span> {sp.bLabel}
            </em>
          </div>
        )
      })}
      {detail?.rows && detail.rows.length > 0 && (
        <div className="ct-grid">
          {detail.rows.map((r) => (
            <span key={r.label}>
              <em>{r.label}</em>
              <b className="num">{r.value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
