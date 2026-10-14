// While there is no earlier period to compare with: one sentence saying when
// comparing starts, and a thin line for the days of data so far.
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import { LEARN_DAYS, type Learning } from './rules'

export function LearnCard({ learning }: { learning: Learning }) {
  return (
    <section className="sv-learn">
      <p>{copy.learnLine(fmtDay(learning.ready))}</p>
      <div className="sv-learn-bar" role="progressbar" aria-valuemin={0} aria-valuemax={LEARN_DAYS} aria-valuenow={learning.days} aria-valuetext={copy.learnDays(learning.days)}>
        <i style={{ width: `${(learning.days / LEARN_DAYS) * 100}%` }} />
      </div>
    </section>
  )
}
