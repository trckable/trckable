// The summary cards at the top of All sites: a quiet label, the number, a pill
// for the move, and a soft area of the days behind it where there is one.
// Revenue is a card only when a shown site has payments connected.
import { Eye, LogOut, Users, Wallet } from 'lucide-react'
import { delta, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import type { SiteRow } from '../lib/api'
import { ShortName } from '../kit/ShortName'
import { kitWords } from '../kit/copy'
import { MetricArea } from '../kit/MetricArea'
import type { Tone } from '../kit/model'
import { OnlineTile } from './OnlineTile'
import { copy } from './allSitesCopy'
import { bounceHigh, bounceTenths, fromStart, type summarize } from './allSitesLogic'

const TONE: Record<string, Tone> = { up: 'good', down: 'bad', flat: 'neutral' }

/** Every shown site's visitors per day, added up from the shared start. */
export function dailyTotal(rows: SiteRow[], start: number): number[] {
  const days = Math.max(0, ...rows.map((r) => fromStart(r.series, start).length))
  return Array.from({ length: days }, (_, i) => rows.reduce((a, r) => a + (fromStart(r.series, start)[i] ?? 0), 0))
}

export function AllSummary({ s, days, rows, start }: { s: ReturnType<typeof summarize>; days: number; rows: SiteRow[]; start: number }) {
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
      <MetricArea icon={<Users size={15} strokeWidth={1.8} />} label={copy.visitors} value={fmtInt(s.total)} pill={d && { text: d.text, tone: TONE[d.tone] ?? 'neutral' }} status={d && copy.vsDays(days)} series={dailyTotal(rows, start)} tone={d ? TONE[d.tone] : 'neutral'} />
      <MetricArea icon={<Eye size={15} strokeWidth={1.8} />} label={copy.pageviews} value={fmtInt(s.pageviews)} status={copy.perVisitor(s.total ? (s.pageviews / s.total).toFixed(1) : '0')} />
      <MetricArea
        icon={<LogOut size={15} strokeWidth={1.8} />}
        iconTone={high ? 'bad' : undefined}
        label={<ShortName full={copy.bounce} short={kitWords.shortBounce} />}
        value={s.total ? fmtPct(s.bounce) : '–'}
        pill={high ? { text: copy.high, tone: 'bad' } : null}
        status={high ? copy.highBounce(bounceTenths(s.bounce)) : copy.acrossSites}
      />
      {rows.length > 0 && s.paying.length > 0 && <MetricArea icon={<Wallet size={15} strokeWidth={1.8} />} label={copy.revenue} value={<span style={{ color: 'var(--money)' }}>{money}</span>} status={copy.fromSites(s.paying.length)} />}
    </div>
  )
}
