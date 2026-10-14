// While there is no earlier period to compare with: seven blocks that fill in as
// days of data arrive, and the day comparing starts.
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import { LEARN_DAYS, type Learning } from './rules'

export function LearnCard({ learning }: { learning: Learning }) {
  return (
    <section className="sv-learn">
      <span className="sv-learn-days" role="progressbar" aria-valuemin={0} aria-valuemax={LEARN_DAYS} aria-valuenow={learning.days} aria-valuetext={copy.learnDays(learning.days)}>
        {Array.from({ length: LEARN_DAYS }, (_, d) => (
          <i key={d} className={d < learning.days ? 'on' : ''} />
        ))}
      </span>
      <b>{copy.learnReady(fmtDay(learning.ready))}</b>
    </section>
  )
}
