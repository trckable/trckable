// The top of Answers: how many answers named or linked the site, against the round before, the rounds as a line, and the
// honest sentence about what was measured.
import { answersCopy as c } from './copy'
import type { AnswersReport } from './api'

function Spark({ rounds }: { rounds: AnswersReport['rounds'] }) {
  const w = 240
  const h = 64
  const top = Math.max(1, ...rounds.map((r) => r.n)) * 1.2
  const pts = rounds.map((r, i) => [4 + (i / Math.max(1, rounds.length - 1)) * (w - 8), h - 6 - (r.n / top) * (h - 14)] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} ${pts[pts.length - 1][0]},${h} ${pts[0][0]},${h}`
  return (
    <svg className="an-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={c.rounds(rounds.length)}>
      <polygon className="area" points={area} />
      <polyline className="line" points={line} vectorEffect="non-scaling-stroke" />
      {pts.map(([x, y], i) => (
        <circle key={rounds[i].at} className={i === pts.length - 1 ? 'dot last' : 'dot'} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.6} />
      ))}
    </svg>
  )
}

export function Summary({ rep }: { rep: AnswersReport }) {
  const diff = rep.was ? rep.seen.n - rep.was.n : 0
  return (
    <section className="an-hero" aria-label={c.seenOf}>
      <div className="an-big">
        <b>{c.seen(rep.seen.n, rep.seen.total)}</b>
        <span className="an-was">
          {rep.was && <span>{c.seenWas(rep.was.n, rep.was.total)}</span>}
          {rep.was && diff !== 0 && <span className={`an-delta${diff < 0 ? ' dn' : ''}`}>{diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`}</span>}
        </span>
        <p className="an-honest">{c.honest}</p>
        <span className="an-meta">
          <span>{c.from(c.countries[rep.country] ?? rep.country)}</span>
          <span>{rep.partial ? c.partial(rep.partial.done, rep.partial.total) : c.next(rep.next)}</span>
        </span>
      </div>
      {rep.rounds.length > 1 && (
        <div className="an-spark-wrap">
          <Spark rounds={rep.rounds} />
          <span className="an-spark-cap">
            <span>{rep.rounds[0].at}</span>
            <span>{c.rounds(rep.rounds.length)}</span>
            <span>{rep.rounds[rep.rounds.length - 1].at}</span>
          </span>
        </div>
      )}
    </section>
  )
}
