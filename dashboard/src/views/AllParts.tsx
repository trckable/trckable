// The small pieces both All sites layouts share: a site's online count, its
// bounce rate (amber and in words when high) and its revenue.
import { TriangleAlert } from 'lucide-react'
import type { SiteRow } from '../lib/api'
import { fmtInt, fmtMoney, fmtPct } from '../lib/format'
import { copy } from './allSitesCopy'
import { bounceHigh, bounceTenths, hasPayments, onlineOf } from './allSitesLogic'

/** "● 24" in the live colour, or "No one online" without a dot. */
export function Online({ r }: { r: SiteRow }) {
  const n = onlineOf(r)
  if (r.error) return <span className="all-online none">{copy.unread}</span>
  if (!n) return <span className="all-online none">{copy.noOne}</span>
  return (
    <span className="all-online" title={copy.onlineNow(fmtInt(n))} aria-label={copy.onlineNow(fmtInt(n))}>
      <span className="pulse" aria-hidden="true" />
      {fmtInt(n)}
    </span>
  )
}

/** The bounce rate; from 75% on amber, with a warning mark and the words for a screen reader. */
export function Bounce({ rate, visitors, short }: { rate: number; visitors: number; short?: boolean }) {
  if (!visitors) return <span className="faint">–</span>
  const text = fmtPct(rate)
  const shown = short ? copy.bounceShort(text) : text
  if (!bounceHigh(rate, visitors)) return <span className="all-bounce">{shown}</span>
  const words = copy.highBounce(bounceTenths(rate))
  return (
    <span className="all-bounce warn" title={words} aria-label={copy.bounceHigh(text, words)}>
      <TriangleAlert size={13} aria-hidden="true" />
      {shown}
    </span>
  )
}

/** A site's revenue, or a quiet "Not connected": never a dash in the money colour. */
export function Money({ r }: { r: SiteRow }) {
  if (!hasPayments(r)) return <span className="faint">{copy.notConnected}</span>
  return <span style={{ color: r.revenue ? 'var(--money)' : 'var(--text-3)' }}>{fmtMoney(r.revenue ?? 0, r.currency, r.exponent)}</span>
}
