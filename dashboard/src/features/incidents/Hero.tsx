// The page's one answer: how the site is right now (Up, Down for 9m, Quiet for 2h) and the period's uptime beside it, one
// line of what happened, and the four figures the incident rows below add up to. Only the time we were watching counts.
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { duration, tooShort, uptimeOf, type Standing } from './model'
import { Tip } from './Tip'

export interface Figures {
  count: number
  seconds: number
  lost: number
  lostSome: boolean
}

export interface Watch {
  /** Seconds of the period we were watching; 0 or less: none of it. */
  span: number
  /** The first watched day, in words, when it falls inside the period. */
  since?: string
  /** False when the site has too few visits for quiet spells to be tracked. */
  quietTracked?: boolean
  /** A site that had no visit the whole period: its uptime says nothing worth a number. */
  silent: boolean
}

function State({ now, at }: { now: Standing; at: number }) {
  if (now.kind === 'unknown') return null
  if (now.kind === 'up') return <b className="inc-state up">{copy.stateUp}</b>
  const span = duration(at - now.since)
  return now.kind === 'down' ? <b className="inc-state down">{copy.stateDown(span)}</b> : <b className="inc-state quiet"><Tip word={copy.stateQuiet(span)} text={copy.quietNote} /></b>
}

/** The uptime as the page says it: the share, or why there is none. */
function uptimeText(f: Figures, w: Watch): { value: string; short: string } {
  const short = tooShort(w.span) ? copy.checkedFor(duration(w.span), f.seconds > 0 ? duration(f.seconds) : '') : ''
  if (w.silent) return { value: copy.noVisitsAll, short }
  if (short) return { value: copy.tooEarly, short }
  const up = uptimeOf(w.span, f.seconds)
  return { value: up ? up.pct.toFixed(1) + '%' : copy.notWatched, short }
}

export function Hero({ now, at, f, w, over }: { now: Standing; at: number; f: Figures; w: Watch; over: string }) {
  if (w.span <= 0) {
    return (
      <section className="inc-hero" aria-label={copy.title}>
        <p className="inc-big">
          <State now={now} at={at} />
          <span className="inc-pct">{copy.notWatched}</span>
        </p>
        <p className="inc-line">{copy.notWatchedNote(w.since ?? '')}</p>
      </section>
    )
  }
  const u = uptimeText(f, w)
  const line = f.count > 0 ? [copy.incidentsLine(f.count), f.lostSome && f.lost > 0 && copy.lostLine(fmtInt(f.lost))].filter(Boolean).join(', ') : ''
  const uptimeTip = [w.quietTracked === false ? copy.downOnlyNote : copy.uptimeNote, w.since && copy.watchedSince(w.since)].filter(Boolean).join(' · ')
  return (
    <section className="inc-hero" aria-label={copy.title}>
      <p className="inc-big">
        <State now={now} at={at} />
        <span className="inc-pct">{u.value}</span>
        {!w.silent && !u.short && u.value.endsWith('%') && <span className="inc-over">{copy.over(over)}</span>}
      </p>
      {(u.short || line) && <p className="inc-line">{u.short || line}</p>}
      <dl className="inc-stats">
        <div>
          <dt>
            {copy.statUptime} <Tip text={uptimeTip} />
          </dt>
          <dd>{u.value}</dd>
        </div>
        <div>
          <dt>{copy.statIncidents}</dt>
          <dd>{fmtInt(f.count)}</dd>
        </div>
        <div>
          <dt>
            {copy.statAffected} <Tip text={copy.affectedNote} />
          </dt>
          <dd>{f.seconds > 0 ? duration(f.seconds) : '0m'}</dd>
        </div>
        {f.lostSome && (
          <div>
            <dt>
              {copy.statLost} <Tip text={copy.lostNote} align="right" />
            </dt>
            <dd>{copy.lostStat(fmtInt(f.lost))}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
