// The cinema's foot: the moment being told as a caption, the progress with its time, and the buttons (pause, skip, close);
// at the end the wrap-up line and Replay again / Share / Close. It is only there while a replay is up. The stage writes
// the caption, the bar and the time on it as the clock moves (ReplayStage); Tab stays on these buttons.
import { useEffect, useRef } from 'react'
import { Pause, Play, RotateCcw, Share2, SkipForward, X } from 'lucide-react'
import { useFocusTrap } from '../../features/install/useFocusTrap'
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
  return r.replay.phase === 'off' ? null : <Foot r={r} />
}

/** Only there while a replay is up, so the focus goes in when it opens and back to the Replay button when it closes. */
function Foot({ r }: { r: ReplayIn }) {
  const { replay } = r
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box)
  // The buttons are new for each phase: focus goes to the first of them, and back to the Replay button when it all closes.
  useEffect(() => {
    box.current?.querySelector('button')?.focus()
  }, [replay.phase])
  useEffect(() => () => document.querySelector<HTMLElement>('[data-replay]')?.focus(), [])
  return (
    <div className="rp-bar" ref={box} data-phase={replay.phase}>
      {replay.phase === 'end' ? (
        <p className="rp-wrap" role="status">
          {wrapOf(r)}
        </p>
      ) : (
        <>
          <p className="rp-sub" data-rp-sub aria-live="polite" />
          <div className="rp-prog" aria-hidden="true">
            <span className="rp-time" data-rp-time />
            <i className="rp-track">
              <b data-rp-prog />
            </i>
          </div>
        </>
      )}
      {/* A new set of buttons for each phase, so the row is never one thing that moved. */}
      <div className="rp-act" key={replay.phase}>
        {replay.phase === 'on' ? (
          <>
            <button type="button" className="rp-btn" onClick={replay.toggle} aria-label={replay.paused ? copy.play : copy.pause} title={replay.paused ? copy.play : copy.pause}>
              {replay.paused ? <Play size={14} strokeWidth={1.75} aria-hidden="true" /> : <Pause size={14} strokeWidth={1.75} aria-hidden="true" />}
              <span>{replay.paused ? copy.play : copy.pause}</span>
            </button>
            <button type="button" className="rp-btn" onClick={replay.next}>
              <SkipForward size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{copy.skip}</span>
            </button>
            <button type="button" className="rp-btn ic" onClick={replay.stop} aria-label={copy.close} title={copy.close}>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </>
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
