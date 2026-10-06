// The summary cards at the top of All sites: one small icon, a quiet label and
// the number. Revenue is a card only when a shown site has payments connected.
import type { ReactNode } from 'react'
import { CircleDollarSign, DoorOpen, FileText, Users } from 'lucide-react'
import { delta, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import type { SiteRow } from '../lib/api'
import { OnlineTile } from './OnlineTile'
import { copy } from './allSitesCopy'
import { bounceHigh, bounceTenths, type summarize } from './allSitesLogic'

export function Stat({ icon, label, sub, warn, children }: { icon: ReactNode; label: string; sub?: ReactNode; warn?: boolean; children: ReactNode }) {
  return (
    <div className={'all-stat' + (warn ? ' warn' : '')}>
      <span className="all-stat-label">
        {icon}
        {label}
      </span>
      <b className="num">{children}</b>
      {sub && <span className="faint">{sub}</span>}
    </div>
  )
}

const ICON = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const

export function AllSummary({ s, days, rows }: { s: ReturnType<typeof summarize>; days: number; rows: SiteRow[] }) {
  const d = s.total || s.previous ? delta(s.total, s.previous) : null
  const currencies = new Set(s.paying.map((r) => r.currency))
  const money =
    s.paying.length && currencies.size === 1
      ? fmtMoney(s.paying.reduce((a, r) => a + (r.revenue ?? 0), 0), s.paying[0].currency, s.paying[0].exponent)
      : copy.currencies(currencies.size)
  const high = bounceHigh(s.bounce, s.total)
  return (
    <div className="all-stats">
      <OnlineTile />
      <Stat icon={<Users {...ICON} />} label={copy.visitors} sub={d && <span className={'delta tone-' + d.tone}>{copy.vsBefore(d.text, days)}</span>}>
        {fmtInt(s.total)}
      </Stat>
      <Stat icon={<FileText {...ICON} />} label={copy.pageviews} sub={copy.perVisitor(s.total ? (s.pageviews / s.total).toFixed(1) : '0')}>
        {fmtInt(s.pageviews)}
      </Stat>
      <Stat icon={<DoorOpen {...ICON} />} label={copy.bounce} warn={high} sub={high ? copy.highBounce(bounceTenths(s.bounce)) : copy.acrossSites}>
        {s.total ? fmtPct(s.bounce) : '–'}
      </Stat>
      {rows.length > 0 && s.paying.length > 0 && (
        <Stat icon={<CircleDollarSign {...ICON} />} label={copy.revenue} sub={copy.fromSites(s.paying.length)}>
          <span style={{ color: 'var(--money)' }}>{money}</span>
        </Stat>
      )}
    </div>
  )
}
