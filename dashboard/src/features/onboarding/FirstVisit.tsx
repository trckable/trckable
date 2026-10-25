import type { Visit } from '../../lib/api'
import { copy } from './copy'
import { factsOf } from './model'

/** One compact card with what the first visit tells, only what is known. */
export function FirstVisit({ visit }: { visit: Visit | undefined }) {
  const t = copy.here
  const label = { page: t.page, source: t.source, country: t.country }
  return (
    <dl className="ob-facts">
      {factsOf(visit).map((f) => (
        <div key={f.kind}>
          <dt className="faint">{label[f.kind]}</dt>
          <dd>{f.value ?? t.direct}</dd>
        </div>
      ))}
      <div>
        <dt className="faint">{t.time}</dt>
        <dd>{t.now}</dd>
      </div>
    </dl>
  )
}
