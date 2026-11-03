// Over the numbers when Explore was opened on a busy moment: the same busy body as the card in the corner (BusyBody),
// in one row: what and since when, the people and how many times the usual, the hour in small, where it came from,
// a pill for "only the source" (never applied by itself: the rest of the traffic stays in view) and a close that goes
// back to today. Everything is in the address, so the link can be shared.
import { X } from 'lucide-react'
import { setView } from '../../lib/url'
import { sameFilter } from '../../lib/filterSet'
import type { Filter } from '../../lib/api'
import { BusyBody, BusyDot } from './BusyBody'
import { signals } from './copy'
import { busySpan, surgeFilter } from './surge'
import { useSurgeMoment } from './useSurgeMoment'

const t = signals.surge

export default function SurgeBanner({ site, tz, started, filters }: { site: string; tz: string; started: number; filters: Filter[] }) {
  const surge = useSurgeMoment(site, started)
  if (!surge) return null
  const only = surgeFilter(surge)
  const applied = !!only && filters.some((f) => sameFilter(f, only))
  const live = !surge.ended
  const lead = (
    <div className="bz-head">
      <BusyDot live={live} />
      <span className="bz-title">
        <b>{live ? t.busyNow : t.busyTitle}</b>
        <span className="bz-when">{busySpan(surge, tz)}</span>
      </span>
    </div>
  )
  const trail = (
    <div className="bz-trail">
      {only && surge.why.source && (
        <button type="button" className="bz-pill" aria-pressed={applied} onClick={() => setView({ xf: applied ? filters.filter((f) => !sameFilter(f, only)) : [...filters, only] })}>
          {t.only(surge.why.source)}
        </button>
      )}
      <button type="button" className="bz-close" aria-label={t.backToday} title={t.backToday} onClick={() => setView({ period: 'today', from: undefined, to: undefined, bucket: undefined, compare: 'previous', cfrom: undefined, cto: undefined, filters: [], xf: [], day: undefined, v: undefined, surge: undefined })}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
  return (
    <div className="surge-banner" role="status" data-live={live ? '1' : undefined}>
      <BusyBody surge={surge} layout="row" lead={lead} trail={trail} />
    </div>
  )
}
