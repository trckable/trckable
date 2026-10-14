// The period's figures: how many incidents, how long the site was down or
// quiet, the share of the period without one, and the visits that probably
// went missing (a card only when there was enough history to estimate). A
// period without an incident is one calm card instead of four mostly empty
// ones, and only the time we were watching counts: `since` is the day that
// began, said when it falls inside the period; `span` is the watched seconds.
import { Check, Eye } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import type { Summary as Totals } from './api'
import { copy } from './copy'
import { duration, uptimeOf } from './model'

export interface Watch {
  /** Seconds of the period we were watching; 0 or less: none of it. */
  span: number
  /** The first watched day, in words, when it falls inside the period. */
  since?: string
  /** False when the site has too few visits for quiet spells to be tracked. */
  quietTracked?: boolean
}

function Calm({ title, note, unwatched }: { title: string; note: string; unwatched?: boolean }) {
  const Icon = unwatched ? Eye : Check
  return (
    <div className={unwatched ? 'inc-clear unwatched' : 'inc-clear'}>
      <span className="inc-tick" aria-hidden="true">
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <div>
        <b>{title}</b>
        <small>{note}</small>
      </div>
    </div>
  )
}

export function Summary({ totals, silent, label, watch }: { totals: Totals; silent: boolean; label: string; watch: Watch }) {
  const downOnly = watch.quietTracked === false
  if (watch.span <= 0) return <Calm unwatched title={copy.notWatched} note={copy.notWatchedNote(watch.since ?? '')} />
  if (totals.count === 0 && !silent) {
    const note = [copy.cleanUp, downOnly && copy.downOnly, watch.since && copy.watchedSince(watch.since)].filter(Boolean).join(' · ')
    return <Calm title={copy.clean(label)} note={note} />
  }
  const uptimeNote = [downOnly ? copy.downOnlyNote : copy.uptimeNote, watch.since && copy.watchedSince(watch.since)].filter(Boolean).join(' · ')
  const up = uptimeOf(watch.span, totals.seconds)
  let upValue = copy.notWatched
  if (silent) upValue = copy.noVisitsAll
  else if (up) upValue = up.pct.toFixed(1) + '%'
  const cards: { label: string; value: string; note?: string }[] = [
    { label: copy.cardIncidents, value: fmtInt(totals.count) },
    { label: copy.cardAffected, value: duration(totals.seconds) },
    { label: copy.cardUptime, value: upValue, note: silent || !up ? undefined : uptimeNote },
  ]
  if (totals.lost_some) cards.push({ label: copy.cardLost, value: copy.lost(fmtInt(totals.lost)), note: copy.lostNote })
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
