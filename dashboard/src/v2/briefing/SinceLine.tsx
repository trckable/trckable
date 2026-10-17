// "Since this morning · +789 people · +2 sales": the line under the period on the hero, and its short form on a phone.
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import type { Since } from './since'

export function SinceLine({ sn }: { sn: Since }) {
  const at = sn.morning ? copy.thisMorning : sn.at
  return (
    <>
      <span className="since">
        <span className="mk-pulse" />
        {sn.quiet ? (
          copy.quietSince(at)
        ) : (
          <>
            {copy.since(at)} · <b>+{fmtInt(sn.people)}</b> {copy.plusPeople(sn.people)}
            {sn.sales > 0 && (
              <>
                {' '}
                · <b>+{sn.sales}</b> {copy.plusSales(sn.sales)}
              </>
            )}
            {sn.down > 0 && (
              <>
                {' '}
                · <b style={{ color: 'var(--mk-red)' }}>{copy.downMin(sn.down)}</b>
              </>
            )}
          </>
        )}
      </span>
      <span className="sincem">
        {sn.quiet ? (
          copy.quietSinceM(sn.at)
        ) : (
          <>
            <b>+{fmtInt(sn.people)}</b> {copy.sinceM(sn.at)}
          </>
        )}
      </span>
    </>
  )
}
