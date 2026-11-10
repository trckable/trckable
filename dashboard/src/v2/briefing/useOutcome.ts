// The site's main outcome behind the chart's bars and faces, read for the page's own period: payments (their amounts per
// bucket come with the report, the faces from the Payments list), else sign-ups (people who reached the signup goal, per
// bucket by the same report cut to that goal, the faces from the latest of them), else pageviews. Chosen once, by outcomeOf.
import { useEffect, useState } from 'react'
import { api, type Bucket, type Filter, type Result, type Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { isShared } from '../../lib/me'
import { fmtCompact, fmtInt, fmtMoneyAxis } from '../../lib/format'
import { extrasApi } from '../../features/extras/extrasApi'
import { copy } from './copy'
import { siteNow } from './chart'
import { facesOf, outcomeOf, type Mark, type Outcome } from '../ui/outcome'
import type { ChartIn } from '../ui/dayChartTypes'

export interface OutcomeRead {
  kind: Outcome
  /** Per bucket of the chart; none until it is read. */
  vals: number[] | null
  marks: Mark[]
}

interface Ask {
  site: Site
  range: Range
  cur: Result
  filters: Filter[]
  bucket: Bucket
  money?: (minor: number) => string
  on: boolean
}

export function useOutcome(o: Ask): OutcomeRead {
  const { site, range, cur, filters, money, on } = o
  const kind = outcomeOf({ money: !!money && !!cur.money, signup: !!cur.signup })
  const goal = cur.signup?.goal ?? ''
  const buckets = cur.series ?? []
  const key = `${kind}|${site.id}|${range.from}|${range.to}|${o.bucket}|${buckets.length}|${buckets[0]?.t ?? ''}|${JSON.stringify(filters)}`
  const [got, setGot] = useState<{ key: string; vals: number[] | null; marks: Mark[] } | null>(null)
  useEffect(() => {
    if (!on || kind === 'views') return
    let live = true
    const q = { from: range.from, to: range.to, filters }
    const tell = (vals: number[] | null, marks: Mark[]) => live && setGot({ key, vals, marks })
    if (kind === 'revenue') {
      tell(buckets.map((p) => p.revenue ?? 0), [])
      if (!isShared())
        void extrasApi.payments(site.id, q, 0, 50).then(
          (r) => tell(buckets.map((p) => p.revenue ?? 0), r.payments.filter((p) => p.amount > 0).map((p) => ({ at: siteNow(site.timezone, new Date(p.at)), id: p.visitor || p.id, text: `${money?.(p.amount) ?? ''}${p.channel ? ` · ${p.channel}` : ''}`, size: p.amount }))),
          () => undefined,
        )
    } else {
      void api.report(site.id, { ...q, filters: [...filters, { dim: 'goal', value: goal }], bucket: o.bucket }).then(
        (r) => {
          const s = r.current.series ?? []
          const vals = s.length === buckets.length ? s.map((p) => p.visitors) : null
          tell(vals, [])
          if (!isShared() && vals)
            void extrasApi.converts(site.id, q, 50).then(
              (c) => tell(vals, c.converts.map((x) => ({ at: siteNow(site.timezone, new Date(x.at)), id: x.visitor, text: copy.outcomeSignedUp, size: 1 }))),
              () => undefined,
            )
        },
        () => undefined,
      )
    }
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- the key names everything it reads
  if (kind === 'views') return { kind, vals: buckets.map((p) => p.pageviews), marks: [] }
  return got && got.key === key ? { kind, vals: got.vals, marks: got.marks } : { kind, vals: null, marks: [] }
}

/** The chart's bars and faces from what was read. None while the bars are being read, and none when nothing was sold or signed up. */
export function outcomeChart(r: OutcomeRead, labels: string[], money: { currency: string; exponent: number; write: (minor: number) => string } | null): Pick<ChartIn, 'bars' | 'faces'> {
  if (!r.vals || (r.kind !== 'views' && !r.vals.some((v) => v > 0))) return {}
  const label = { revenue: copy.outcomeRevenue, signups: copy.outcomeSignups, views: copy.outcomeViews }[r.kind]
  const faceLabel = r.kind === 'revenue' ? copy.outcomePayments : ''
  const axis = r.kind === 'revenue' && money ? (n: number) => fmtMoneyAxis(n, money.currency, money.exponent) : fmtCompact
  const read = r.kind === 'revenue' && money ? money.write : (n: number) => `${fmtInt(n)} ${label.toLowerCase()}`
  const faces = r.kind === 'views' ? [] : facesOf(labels, r.marks)
  return { bars: { kind: r.kind, vals: r.vals, label, faceLabel, people: copy.outcomePeople, axis, read }, faces }
}
