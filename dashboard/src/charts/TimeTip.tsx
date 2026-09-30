// The main chart's hover card: the day, its figure with how it compares, a
// thin new/returning bar, one row of small figures, and the day's notes, one
// line each. Every value the chart knows for the bucket is here.
import type { Annotation } from '../lib/api'
import { fmtInt } from '../lib/format'
import { timeCopy } from './copy'
import type { TimeChartProps } from './TimeChart'
import { bucketLabel } from './timeScale'
import './TimeTip.css'
import './Tip.css'

type Detail = NonNullable<ReturnType<NonNullable<TimeChartProps['detail']>>>
type Split = NonNullable<Detail['splits']>[number]

const share = (sp: Split) => `${Math.round((sp.a / Math.max(1, sp.a + sp.b)) * 100)}%`

function Change({ p, i }: { p: TimeChartProps; i: number }) {
  if (!p.ghost || p.ghost[i] === undefined) return null
  const a = p.values[i] ?? 0
  const b = p.ghost[i] ?? 0
  const pct = b ? Math.round(((a - b) / b) * 100) : null
  const when = p.ghostLabels?.[i] ? bucketLabel(p.ghostLabels[i], p.bucket, true) : undefined
  return (
    <>
      {pct !== null && <em className={pct >= 0 ? 'tone-up num' : 'tone-down num'}>{`${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`}</em>}
      <span className="ct-vs num">{timeCopy.vs(fmtInt(b), when)}</span>
    </>
  )
}

export default function TimeTip({ p, i, left, width, notes }: { p: TimeChartProps; i: number; left: number; width: number; notes: Annotation[] }) {
  const detail = p.detail?.(i) ?? null
  const splits = detail?.splits ?? []
  const rows = detail?.rows ?? []
  const cells = [...(splits[0] ? [{ label: splits[0].aLabel, value: share(splits[0]) }] : []), ...rows.filter((r) => !r.inline)]
  return (
    <div className="chart-tip time-tip" style={{ left, width }}>
      <div className="ct-head">
        <span className="num">{bucketLabel(p.labels[i], p.bucket, true)}</span>
        {p.partialLast && i === p.values.length - 1 && <span className="ct-live">{timeCopy.soFar}</span>}
      </div>
      <div className="ct-main">
        <b className="num ct-big">{fmtInt(p.values[i] ?? 0)}</b>
        <span>{p.metric.toLowerCase()}</span>
        <Change p={p} i={i} />
      </div>
      {p.strip && (
        <div className="ct-main money">
          <b className="num">{p.strip.fmt(p.strip.values[i] ?? 0)}</b>
          <span>{p.strip.label.toLowerCase()}</span>
          {rows.filter((r) => r.inline).map((r) => (
            <em key={r.label} className="num">
              {r.value}
              {r.label}
            </em>
          ))}
        </div>
      )}
      {p.overlay && (
        <div className="ct-main">
          <b className="num">{fmtInt(p.overlay.values[i] ?? 0)}</b>
          <span>
            <i style={{ background: p.overlay.color }} />
            {p.overlay.name}
          </span>
        </div>
      )}
      {splits.map((sp) => (
        <div className="ct-split" key={sp.aLabel + sp.bLabel} aria-hidden="true">
          <span className="ct-split-bar">
            <span style={{ width: `${(sp.a / Math.max(1, sp.a + sp.b)) * 100}%`, background: sp.tone ?? 'var(--accent)' }} />
          </span>
          {/* The visitors' bar is read from the % new below it; a bar in another colour says its own parts. */}
          {sp.tone && (
            <em>
              <span className="num">{(sp.fmt ?? fmtInt)(sp.a)}</span> {sp.aLabel} · <span className="num">{(sp.fmt ?? fmtInt)(sp.b)}</span> {sp.bLabel}
            </em>
          )}
        </div>
      ))}
      {cells.length > 0 && (
        <div className="ct-row">
          {cells.map((c) => (
            <span key={c.label}>
              <b className="num">{c.value}</b>
              <em>{c.label}</em>
            </span>
          ))}
        </div>
      )}
      {/* The flag on the axis holds the whole note; here it is one line. */}
      {notes.map((note) => (
        <div className="tip-note" key={note.id}>
          {note.text}
        </div>
      ))}
    </div>
  )
}
