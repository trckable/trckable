// Retention as a table of the explore kind: the week people first came in the rows, the weeks after across, one ramp of
// the accent in the cells and the average under them.
import { XEmpty, XError } from '../../../ui/XBits'
import { useLoad } from '../../data/useLoad'
import { Loading } from '../../../../components/loading/Loading'
import { type ReportQuery, more } from '../../../../lib/apiMore'
import { fmtInt, fmtPct, dateFmt } from '../../../../lib/format'
import { tag } from '../../../../i18n'
import { deepCopy } from '../../../../features/cards/deepCopy'
import { retentionOf, shade } from '../../../../features/cards/retentionModel'
import type { XCtx } from '../../ctx'

const weekLabel = (iso: string) => dateFmt(tag, { day: 'numeric', month: 'short' }).format(new Date(iso + 'T00:00:00'))

export function XRetention({ x, query }: { x: XCtx; query: ReportQuery }) {
  const c = deepCopy.retention
  const key = `${x.site.id}|${query.from}|${query.to}|${query.testPayments ? 'test' : ''}|${JSON.stringify(query.filters ?? [])}`
  const got = useLoad(key, () => more.retention(x.site.id, query), true)
  if (got.state === 'loading') return <Loading height={140} />
  if (got.state === 'error') return <XError title={c.failed} onRetry={got.retry} />
  const r = retentionOf(got.data)
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
