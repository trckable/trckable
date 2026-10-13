// The period's four figures: how many incidents, how long the site was down or
// quiet, the share of the period without one, and the visits that probably
// went missing (only when there was enough history to estimate; otherwise a dash).
import { fmtInt } from '../../lib/format'
import type { Summary as Totals } from './api'
import { copy } from './copy'
import { duration, uptimePct } from './model'

export function Summary({ totals, period, silent }: { totals: Totals; period: number; silent: boolean }) {
  const cards: { label: string; value: string; note?: string }[] = [
    { label: copy.cardIncidents, value: fmtInt(totals.count) },
    { label: copy.cardAffected, value: totals.count ? duration(totals.seconds) : '–' },
    { label: copy.cardUptime, value: silent ? copy.noVisitsAll : uptimePct(period, totals.seconds).toFixed(1) + '%', note: silent ? undefined : copy.uptimeNote },
    { label: copy.cardLost, value: totals.lost_some ? copy.lost(fmtInt(totals.lost)) : copy.lostNone, note: totals.lost_some ? copy.lostNote : undefined },
  ]
  return (
    <div className="inc-cards">
      {cards.map((c) => (
        <div key={c.label} className="inc-card">
          <small>{c.label}</small>
          <b className="num">{c.value}</b>
          {c.note && <em>{c.note}</em>}
        </div>
      ))}
    </div>
  )
}
