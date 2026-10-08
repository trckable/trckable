// The story of one moment, in a card beside its label: the days and how long
// they lasted, the visitors in them against a normal stretch, the share of its
// main source, where most landed, what came after, and the way into those days.
// Aggregates only (the period's own report for those days).
import { useEffect, useState } from 'react'
import { api, type Report } from '../../lib/api'
import { fmtInt, fmtPct } from '../../lib/format'
import { diffDays } from '../../lib/dates'
import { periodOf } from '../story/moments'
import { copy } from '../moments/copy'
import { afterOf, usualOf, type Span } from '../moments/spans'
import { headline } from '../moments/words'
import { hostLabel } from '../moments/words'

export function SpanCard({ site, span, visitors, onOpen }: { site: string; span: Span; visitors: number[]; onOpen: () => void }) {
  const [report, setReport] = useState<Report | null>(null)
  const days = span.from && span.to ? diffDays(span.from, span.to) + 1 : 1
  useEffect(() => {
    if (!span.from) return
    const ctl = new AbortController()
    api
      .report(site, { from: span.from, to: span.to, compare: 'previous', bucket: 'day' }, ctl.signal)
      .then(setReport)
      .catch(() => undefined)
    return () => ctl.abort()
  }, [site, span.from, span.to])
  const now = report?.current
  const total = now?.kpis.visitors ?? 0
  const normal = usualOf(span) ?? report?.previous?.kpis.visitors
  const host = span.main.n.referrer
  const row = host ? (now?.dims.referrer ?? []).find((r) => r.value === host) : undefined
  const landed = (now?.dims.entry_page ?? [])[0]?.value
  const after = afterOf(span, visitors)
  const daysText = copy.span.days(days)
  return (
    <div className="sv-story">
      <div className="sv-story-day">{`${periodOf([span.from, span.to])} · ${daysText}`}</div>
      <div className="sv-story-head">{headline(span)}</div>
      {now && (
        <dl className="sv-story-rows">
          <dt>{copy.span.rowVisitors}</dt>
          <dd>{fmtInt(total)}</dd>
          {normal != null && (
            <>
              <dt>{copy.span.rowNormal(daysText)}</dt>
              <dd>{`~${fmtInt(normal)}`}</dd>
            </>
          )}
          {host && row && total > 0 && (
            <>
              <dt>{copy.span.rowSource(hostLabel(host))}</dt>
              <dd>{fmtPct(row.visitors / total)}</dd>
            </>
          )}
          {landed && (
            <>
              <dt>{copy.span.rowLanded}</dt>
              <dd className="sv-story-path">{landed}</dd>
            </>
          )}
        </dl>
      )}
      {after && <p className="sv-story-next">{after.kept ? copy.span.kept(fmtInt(after.each)) : copy.span.faded}</p>}
      <button type="button" className="sv-story-open" data-nav onClick={onOpen}>
        {copy.span.openDays}
      </button>
    </div>
  )
}
