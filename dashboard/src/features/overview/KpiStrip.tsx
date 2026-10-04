// The key numbers, one light strip: Visitors, then Revenue, Conversion and
// Per visitor where there are payments (Pageviews where there are not, with a
// dimmed Revenue tile before it for an owner), Bounce rate, Session time, and
// Online now last. Each is a button that puts it on
// the main chart when the chart can draw it here (chartMetric).
import type { ReactNode } from 'react'
import type { Bots, KPIs, Money, Site } from '../../lib/api'
import { delta, fmtDuration, fmtInt, fmtMoney, fmtPct, fmtRatio, type Delta } from '../../lib/format'
import { canChart, type Can, type ChartMetric } from './chartMetric'
import { botsLine } from './botsLine'
import { copy } from './copy'
import { KpiTile } from './KpiTile'
import { KpiMark } from './kpiMark'
import { canChange } from '../../lib/me'

interface Props {
  loading: boolean
  /** The comparison in words, as the period picker says it. */
  vs: string
  metric: ChartMetric
  can: Can
  onPick: (m: ChartMetric) => void
  k?: KPIs
  /** The period before, when it is there in full to compare with. */
  pk?: KPIs
  money?: Money
  pm?: Money
  /** The day's or period's revenue, conversion and revenue per visitor as the page shows them. */
  revenue?: number
  conv?: number
  rpv?: number
  /** Makes a tile a function of Replay's playhead while it plays. */
  follow: (f: (r: { kpis: KPIs; revenue: number }) => number) => ((pos: number) => number) | undefined
  /** While Replay has not reached a first visit: those tiles show a dash. */
  blank?: (pos: number) => boolean
  /** Revenue, Conversion and Per visitor keep their places while the report loads, so the strip does not reflow when it arrives. */
  expectMoney?: boolean
  /** The Visitors tile's small line, when its period has one (visitorsHint). */
  hint?: ReactNode
  /** The Visitors tile's month pace line, when this period has one (features/extras/PaceLine). */
  pace?: ReactNode
  /** What was filtered out of the period: a line in the Visitors tile's tooltip. */
  bots?: Bots
  /** Online now, last. */
  online: ReactNode
  /** The site whose Settings → Payments the Revenue tile opens. */
  site: Site
}

export function KpiStrip(p: Props) {
  const { k, pk, money, pm } = p
  const rate = (x: number) => fmtRatio(x, x < 0.1 ? 2 : 1)
  const cents = (x: number) => (money ? fmtMoney(x, money.currency, money.exponent, { cents: true }) : '')
  const tile = (key: ChartMetric, label: string, value: number | undefined, fmt: (n: number) => string, d: Delta | null, o: { live?: (r: { kpis: KPIs; revenue: number }) => number; money?: boolean; hint?: ReactNode; pace?: ReactNode; tip?: string } = {}) => (
    <KpiTile
      key={key}
      loading={p.loading}
      vs={p.vs}
      label={label}
      icon={key}
      value={value}
      live={o.live && p.follow(o.live)}
      blank={o.live && p.blank}
      fmt={fmt}
      d={d}
      money={o.money}
      hint={o.hint}
      pace={o.pace}
      tip={o.tip}
      pressed={p.metric === key}
      onClick={canChart(key, p.can) ? () => p.onPick(key) : undefined}
    />
  )
  // What follows Visitors: the money numbers, Pageviews without payments, or
  // the money numbers' empty places while a report that will have them loads.
  // Where there are none, an owner (canChange: never a viewer or a shared
  // link) has the dimmed Revenue tile before Pageviews.
  const second = () => {
    if (money)
      return (
        <>
          {tile('revenue', copy.revenue, p.revenue, (n) => fmtMoney(n, money.currency, money.exponent), pm ? delta(money.revenue, pm.revenue) : null, { live: (r) => r.revenue, money: true })}
          {tile('conversion', copy.conversion, p.conv, rate, pm && p.conv !== undefined ? delta(p.conv, pm.conversion) : null)}
          {tile('per-visitor', copy.perVisitorTile, p.rpv, cents, pm && p.rpv !== undefined ? delta(p.rpv, pm.revenue_per_visitor) : null, { live: (r) => (r.kpis.visitors ? r.revenue / r.kpis.visitors : 0), money: true })}
        </>
      )
    if (p.loading && p.expectMoney)
      return (
        <>
          {tile('revenue', copy.revenue, undefined, fmtInt, null, { money: true })}
          {tile('conversion', copy.conversion, undefined, fmtInt, null)}
          {tile('per-visitor', copy.perVisitorTile, undefined, fmtInt, null, { money: true })}
        </>
      )
    return (
      <>
        {canChange() && <KpiMark k="revenue" tile={p.site} />}
        {tile('pageviews', copy.pageviews, k?.pageviews, fmtInt, delta(k?.pageviews ?? 0, pk?.pageviews), { live: (r) => r.kpis.pageviews })}
      </>
    )
  }
  return (
    <div role="group" aria-label={copy.keyNumbers} className="kpis">
      {tile('visitors', copy.visitors, k?.visitors, fmtInt, delta(k?.visitors ?? 0, pk?.visitors), { live: (r) => r.kpis.visitors, hint: p.hint, pace: p.pace, tip: botsLine(p.bots) })}
      {second()}
      {tile('bounce', copy.bounce, k?.bounce_rate, fmtPct, delta(k?.bounce_rate ?? 0, pk?.bounce_rate, true), { live: (r) => r.kpis.bounce_rate })}
      {tile('session', copy.session, k?.avg_session_s, fmtDuration, delta(k?.avg_session_s ?? 0, pk?.avg_session_s), { live: (r) => r.kpis.avg_session_s })}
      {p.online}
    </div>
  )
}
