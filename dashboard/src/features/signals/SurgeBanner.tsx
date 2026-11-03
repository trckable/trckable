// Over the numbers when Explore was opened on a busy moment: a small card with what it was and when (a live dot
// while it lasts), where it came from, a chip for "only the source" (never applied by itself: the rest of the
// traffic stays in view) and a close that goes back to today. Everything is in the address, so the link can be shared.
import { X, Zap } from 'lucide-react'
import { setView } from '../../lib/url'
import { sameFilter } from '../../lib/filterSet'
import type { Filter } from '../../lib/api'
import { signals } from './copy'
import { bannerParts, surgeFilter } from './surge'
import { PathChip } from './PathChip'
import { useSurgeMoment } from './useSurgeMoment'

const t = signals.surge

export default function SurgeBanner({ site, tz, started, filters }: { site: string; tz: string; started: number; filters: Filter[] }) {
  const surge = useSurgeMoment(site, started)
  if (!surge) return null
  const only = surgeFilter(surge)
  const applied = !!only && filters.some((f) => sameFilter(f, only))
  const pickPage = (value: string) => setView({ xf: [...filters.filter((f) => f.dim !== 'page'), { dim: 'page', value }] })
  const p = bannerParts(surge, tz)
  return (
    <div className="surge-banner" role="status" data-live={surge.ended ? undefined : '1'}>
      <span className="sbn-ico" aria-hidden="true">
        <Zap size={16} strokeWidth={2} />
      </span>
      <div className="sbn-txt">
        <div className="sbn-head">
          <b>{t.busyTitle}</b>
          <span className="sbn-when">{p.span}</span>
        </div>
        <div className="sbn-sub">
          {[p.peak, p.source].filter(Boolean).join(' · ')}
          {surge.why.source && surge.why.page && (
            <>
              {' → '}
              <PathChip page={surge.why.page} onPick={() => pickPage(surge.why.page ?? '')} />
            </>
          )}
        </div>
      </div>
      <div className="surge-banner-actions">
        {only && surge.why.source && (
          <button type="button" className="sbn-only" aria-pressed={applied} onClick={() => setView({ xf: applied ? filters.filter((f) => !sameFilter(f, only)) : [...filters, only] })}>
            {t.only(surge.why.source)}
          </button>
        )}
        <button type="button" className="sbn-close" aria-label={t.backToday} title={t.backToday} onClick={() => setView({ period: 'today', from: undefined, to: undefined, bucket: undefined, compare: 'previous', cfrom: undefined, cto: undefined, filters: [], xf: [], day: undefined, v: undefined, surge: undefined })}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
