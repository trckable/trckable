// Over the numbers when Data was opened on a busy moment: what it was in one line, a chip for
// "only the source" (never applied by itself: the rest of the traffic stays in view) and the
// way back to today. Everything is in the address, so the link can be shared.
import { setView } from '../../lib/url'
import { sameFilter } from '../../lib/filterSet'
import type { Filter } from '../../lib/api'
import { signals } from './copy'
import { bannerLine, surgeFilter } from './surge'
import { useSurgeMoment } from './useSurgeMoment'

const t = signals.surge

export default function SurgeBanner({ site, tz, started, filters }: { site: string; tz: string; started: number; filters: Filter[] }) {
  const surge = useSurgeMoment(site, started)
  if (!surge) return null
  const only = surgeFilter(surge)
  const applied = !!only && filters.some((f) => sameFilter(f, only))
  return (
    <div className="banner surge-banner" role="status">
      <span>{bannerLine(surge, tz)}</span>
      {only && surge.why.source && (
        <button type="button" className="chip" aria-pressed={applied} onClick={() => setView({ filters: applied ? filters.filter((f) => !sameFilter(f, only)) : [...filters, only] })}>
          {t.only(surge.why.source)}
        </button>
      )}
      <button type="button" className="btn ghost" onClick={() => setView({ period: 'today', from: undefined, to: undefined, bucket: undefined, compare: 'previous', cfrom: undefined, cto: undefined, filters: [], day: undefined, v: undefined, surge: undefined })}>
        {t.backToday}
      </button>
    </div>
  )
}
