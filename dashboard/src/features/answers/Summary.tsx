// The top of Answers: how many answers named or linked the site, against the round before, the rounds as a line, and the
// honest sentence about what was measured.
import { answersCopy as c } from './copy'
import type { AnswersReport, Round } from './api'
import { dayOf, where } from './when'

function Spark({ rounds }: { rounds: Round[] }) {
  const w = 240
  const h = 64
  const top = Math.max(1, ...rounds.map((r) => r.seen)) * 1.2
  const pts = rounds.map((r, i) => [4 + (i / Math.max(1, rounds.length - 1)) * (w - 8), h - 6 - (r.seen / top) * (h - 14)] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} ${pts[pts.length - 1][0]},${h} ${pts[0][0]},${h}`
  return (
    <svg className="an-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={c.rounds(rounds.length)}>
      <polygon className="area" points={area} />
      <polyline className="line" points={line} vectorEffect="non-scaling-stroke" />
      {pts.map(([x, y], i) => (
        <circle key={rounds[i].round} className={i === pts.length - 1 ? 'dot last' : 'dot'} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.6} />
      ))}
    </svg>
  )
}

/** The last line under the headline: how far a round is, that the budget paused it, or when the next one is. */
function noteOf(rep: AnswersReport, progress?: { done: number; total: number }): string {
  if (progress) return c.partial(progress.done, progress.total)
  if (rep.paused) return c.paused
  return rep.next_at ? c.next(dayOf(rep.next_at)) : ''
}

export function Summary({ rep, progress }: { rep: AnswersReport; progress?: { done: number; total: number } }) {
  const now = rep.latest
  const was = rep.was
  const rounds = rep.rounds ?? []
  const diff = now && was ? now.seen - was.seen : 0
  const note = noteOf(rep, progress)
  return (
    <section className="an-hero" aria-label={c.seenOf}>
      <div className="an-big">
        {now && <b>{c.seen(now.seen, now.total)}</b>}
        <span className="an-was">
          {was && <span>{c.seenWas(was.seen, was.total)}</span>}
          {was && diff !== 0 && <span className={`an-delta${diff < 0 ? ' dn' : ''}`}>{diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`}</span>}
        </span>
        <p className="an-honest">{c.honest}</p>
        <span className="an-meta">
          {rep.country && <span>{c.from(where(rep.country))}</span>}
          {note && <span>{note}</span>}
        </span>
      </div>
      {rounds.length > 1 && (
        <div className="an-spark-wrap">
          <Spark rounds={rounds} />
          <span className="an-spark-cap">
            <span>{dayOf(rounds[0].round)}</span>
            <span>{c.rounds(rounds.length)}</span>
            <span>{dayOf(rounds[rounds.length - 1].round)}</span>
          </span>
        </div>
      )}
    </section>
  )
}
