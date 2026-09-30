// Retention as a cohort table: the week people first came in the rows, the
// weeks after across. The first column is how many people the cohort was (not
// 100%), each cell one ramp of the accent, weeks not over yet a dot. A small
// curve over the table is the average. With under two whole weeks of history,
// one line instead of an empty table.
import { useEffect, useState } from 'react'
import { Info } from '../../components/Info'
import { Loading } from '../../components/loading/Loading'
import { api, type Cohorts, type ReportQuery, type Site } from '../../lib/api'
import { fmtInt, fmtPct } from '../../lib/format'
import { deepCopy } from './deepCopy'
import { retentionOf, shade } from './retentionModel'
import './deep.css'

const weekLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const INFO = 'Each row is the week a group of people first arrived; each column is a week after that. The figure is the share of that group who came back. Someone’s week is when trckable first saw them, not when this report starts.'

/** The average share back, week by week, over the columns of the table below it. */
function Curve({ values }: { values: number[] }) {
  const top = Math.max(0.001, ...values)
  const H = 52
  const pts = values.map((v, i) => ({ x: ((i + 0.5) / values.length) * 100, y: 20 + (1 - v / top) * (H - 28) }))
  return (
    <div className="rt-curve" role="img" aria-label={deepCopy.retention.curve(values.length)}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(1)}`).join('')} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {pts.map((p, i) => (
        <span key={i} className="rt-dot num" style={{ left: `${p.x}%`, top: `${p.y}px` }}>
          <i />
          <b>{fmtPct(values[i])}</b>
        </span>
      ))}
    </div>
  )
}

export default function Retention({ site, query }: { site: Site; query: ReportQuery }) {
  const [data, setData] = useState<Cohorts | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    api
      .retention(site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [site.id, query])
  const r = retentionOf(data)
  const c = deepCopy.retention
  return (
    <div className="rt-panel">
      <div className="tc-tools">
        <Info text={INFO} />
      </div>
      {err && <span className="faint">{c.failed}</span>}
      {!err && !data && <Loading height={140} />}
      {!err && data && r.kind === 'none' && <span className="faint">{c.none}</span>}
      {!err && r.kind === 'line' && <p className="rt-line num">{c.nextWeek(r.nextWeek)}</p>}
      {!err && r.kind === 'table' && (
        <>
          <div className="rt" style={{ ['--weeks' as string]: r.cols }}>
            <Curve values={r.curve} />
            <span className="rt-h">{c.arrived}</span>
            <span className="rt-h rt-n">{c.people}</span>
            {r.curve.map((_, j) => (
              <span key={j} className="rt-h rt-c">
                {c.week(j + 1)}
              </span>
            ))}
            {r.weeks.map((w, i) => (
              <div key={w} className="rt-row">
                <span className="rt-week num">{weekLabel(w)}</span>
                <span className="rt-n num">{fmtInt(r.size[i])}</span>
                {r.cells[i].map((cell, j) =>
                  cell.state === 'done' ? (
                    <span key={j} className="rt-c rt-cell num" title={c.cell(cell.back, r.size[i])} style={{ background: `color-mix(in srgb, var(--accent) ${shade(cell.share, r.top)}%, transparent)` }}>
                      {fmtPct(cell.share)}
                    </span>
                  ) : (
                    <span key={j} className="rt-c rt-open" title={c.inProgress} aria-label={c.inProgress}>
                      {c.open}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
