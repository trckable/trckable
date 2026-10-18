// The row under the chart in the replay lab. It has its height before anything plays, so what it says never moves the page:
// the moments as chips (the clock variant), the one-line wrap-up at the end, and the buttons that are always there.
import { RotateCcw, Share2, SkipForward, Square, X } from 'lucide-react'
import type { Cap, LabMode } from '../replay/lab'
import { copy } from '../replay/lab.copy'
import type { Lab } from '../replay/useLab'

export function LabFoot({ mode, phase, caps, wrap, lab, onShare }: { mode: LabMode; phase: Lab['phase']; caps: Cap[]; wrap: string; lab: Lab; onShare: () => void }) {
  return (
    <div className="lab-foot" data-phase={phase}>
      <div className="lab-main">
        {mode === 'clock' && (
          <ul className="lab-chips" aria-label={copy.moments}>
            {caps.map((c) => (
              <li key={`${c.pos}${c.kind}`} className={`lab-chip ${c.kind}`} data-chip data-s="">
                <b>{c.at}</b>
                <span>{c.line}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="lab-wrap" role="status">
          {phase === 'end' ? wrap : ''}
        </p>
      </div>
      <div className="lab-act">
        {phase === 'on' && (
          <>
            <button type="button" className="lab-btn" onClick={lab.skip}>
              <SkipForward size={14} strokeWidth={1.75} aria-hidden="true" />
              {copy.skip}
            </button>
            <button type="button" className="lab-btn" onClick={lab.stop}>
              <Square size={12} strokeWidth={1.75} aria-hidden="true" />
              {copy.stop}
            </button>
          </>
        )}
        {phase === 'end' && (
          <>
            <button type="button" className="lab-btn" onClick={lab.start}>
              <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
              {copy.again}
            </button>
            <button type="button" className="lab-btn pri" onClick={onShare}>
              <Share2 size={14} strokeWidth={1.75} aria-hidden="true" />
              {copy.share}
            </button>
            <button type="button" className="lab-btn ic" onClick={lab.stop} aria-label={copy.close} title={copy.close}>
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
