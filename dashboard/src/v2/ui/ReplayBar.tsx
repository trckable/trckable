// The replay's buttons and its one-line wrap-up, in the row above the chart: it takes the place of the chart's own line
// and the Notes button while a replay is up, laid over that row (absolute), so it adds no height and moves nothing.
import { RotateCcw, Share2, SkipForward, X } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import { sourceName } from '../briefing/model'
import { best } from '../../features/story/moments'
import { copy } from '../replay/story.copy'
import type { ReplayIn } from './ReplayStage'

/** "By 23:33: 1,234 people, best hour 17:00, from Google": every number is the period's own. */
export function wrapOf(r: ReplayIn): string {
  const b = best(r.labels, r.vals, r.bucket)
  const top = b ? bestOf(r, b) : ''
  return copy.wrap(r.today ? copy.by(r.clock) : r.period, fmtInt(r.total), top, r.source ? sourceName(r.source) : undefined)
}

const bestOf = (r: ReplayIn, b: string) => (r.bucket === 'hour' ? copy.bestHour(b) : copy.bestDay(b))

export function ReplayBar({ r }: { r: ReplayIn }) {
  const { replay } = r
  if (replay.phase === 'off') return null
  return (
    <div className="rp-bar" data-phase={replay.phase}>
      {replay.phase === 'end' && (
        <p className="rp-wrap" role="status">
          {wrapOf(r)}
        </p>
      )}
      {/* A new set of buttons for each phase, so the row is never one thing that moved. */}
      <div className="rp-act" key={replay.phase}>
        {replay.phase === 'on' ? (
          <button type="button" className="rp-btn" onClick={replay.skip}>
            <SkipForward size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{copy.skip}</span>
          </button>
        ) : (
          <>
            <button type="button" className="rp-btn" onClick={replay.start} aria-label={copy.again} title={copy.again}>
              <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{copy.again}</span>
            </button>
            <button type="button" className="rp-btn pri" onClick={r.onShare} aria-label={copy.share} title={copy.share}>
              <Share2 size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{copy.share}</span>
            </button>
            <button type="button" className="rp-btn ic" onClick={replay.stop} aria-label={copy.close} title={copy.close}>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
