// Retention as a table of the explore kind: the week people first came in the rows, the weeks after across, one ramp of
// the accent in the cells and the average under them.
import { useEffect, useState } from 'react'
import { XEmpty } from '../../../ui/XBits'
import { Loading } from '../../../../components/loading/Loading'
import { type Cohorts, type ReportQuery, more } from '../../../../lib/apiMore'
import { fmtInt, fmtPct } from '../../../../lib/format'
import { tag } from '../../../../i18n'
import { deepCopy } from '../../../../features/cards/deepCopy'
import { retentionOf, shade } from '../../../../features/cards/retentionModel'
import type { XCtx } from '../../ctx'

const weekLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(tag, { day: 'numeric', month: 'short' })

export function XRetention({ x, query }: { x: XCtx; query: ReportQuery }) {
  const c = deepCopy.retention
  const [data, setData] = useState<Cohorts | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    more
      .retention(x.site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [x.site.id, query])
  const r = retentionOf(data)
  if (err) return <XEmpty title={c.failed} hint="" />
  if (!data) return <Loading height={140} />
  if (r.kind === 'none') return <XEmpty title={c.none} hint="" />
  if (r.kind === 'line') return <XEmpty title={c.nextWeek(r.nextWeek)} hint="" />
  return (
    <div className="xt xrt" style={{ '--weeks': r.cols } as React.CSSProperties} role="table" aria-label={c.title}>
      <div className="xth" role="row">
        <span>{c.arrived}</span>
        <span>{c.people}</span>
        {r.curve.map((_, j) => (
          <span key={j}>{c.week(j + 1)}</span>
        ))}
      </div>
      {r.weeks.map((w, i) => (
        <div key={w} className="xrw" role="row">
          <span className="mk-quiet">{weekLabel(w)}</span>
          <span className="mk-n">{fmtInt(r.size[i])}</span>
          {r.cells[i].map((cell, j) =>
            cell.state === 'done' ? (
              <span key={j} className="xrcell" title={c.cell(cell.back, r.size[i])} style={{ background: `color-mix(in srgb, var(--mk-lime) ${shade(cell.share, r.top)}%, transparent)` }}>
                {fmtPct(cell.share)}
              </span>
            ) : (
              <span key={j} className="xrcell open" title={c.inProgress} aria-label={c.inProgress}>
                {c.open}
              </span>
            ),
          )}
        </div>
      ))}
      <div className="xrw avg" role="row" aria-label={c.curve(r.cols)}>
        <span>{'Ø'}</span>
        <span />
        {r.curve.map((v, j) => (
          <span key={j} className="xrcell">
            {fmtPct(v)}
          </span>
        ))}
      </div>
    </div>
  )
}
