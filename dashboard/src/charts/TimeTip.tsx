// The main chart's hover card: the day, its figures large, how it compares,
// its note, then the smaller numbers in two columns.
import { useEffect, useReducer } from 'react'
import type { Annotation } from '../lib/api'
import { fmtInt } from '../lib/format'
import { timeCopy } from './copy'
import type { TimeChartProps } from './timeProps'
import { bucketLabel } from './timeScale'
import { Hero, Versus } from './TimeHero'
import { CompactTip } from './TimeTipCompact'
import { modelCopy } from './models/modelCopy'
import { ModelBody } from './models/ModelTip'
import './TimeTip.css'
import './Tip.css'

export default function TimeTip({ p, i, left, width, compact, notes }: { p: TimeChartProps; i: number; left: number; width: number; compact: boolean; notes: Annotation[] }) {
  // The card's lines come from a chunk fetched when the browser is idle: a card
  // open before it arrived draws them the moment it does.
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    window.addEventListener('trckable:tips', redraw)
    return () => window.removeEventListener('trckable:tips', redraw)
  }, [])
  const detail = p.detail?.(i) ?? null
  const fmt = p.fmt ?? fmtInt
  const money = p.tone === 'money'
  const tone = money ? 'var(--money)' : 'var(--accent)'
  const sales = p.saleNote?.(i) ?? null
  if (compact) return <CompactTip p={p} i={i} left={left} width={width} detail={detail} notes={notes} />
  return (
    <div className="chart-tip time-tip" style={{ left }}>
      <div className="ct-head">
        <b>{bucketLabel(p.labels[i], p.bucket, true)}</b>
        {p.partialLast && i === p.values.length - 1 && <span className="ct-live">{p.model ? modelCopy.soFar : 'In progress'}</span>}
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
      {p.model ? (
        <ModelBody p={p} i={i} />
      ) : (
        <Hero label={p.metric} color={tone} big={money && !p.values[i] ? null : fmt(p.values[i] ?? 0)} note={money ? sales : null}>
          {p.ghost && p.ghost[i] !== undefined && <Versus a={p.values[i] ?? 0} b={p.ghost[i] ?? 0} fmt={fmt} when={p.ghostLabels?.[i]} bucket={p.bucket} />}
        </Hero>
      )}
      {p.revenue && !money && <Hero label={p.revenue.label} color="var(--money)" big={p.revenue.values[i] > 0 ? p.revenue.fmt(p.revenue.values[i]) : null} note={sales} />}
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
