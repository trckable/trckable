// The bar at the bottom while the day is played back: what is happening now, the play button, the clock, the
// scrubber, the speed and the way out. With reduced motion the moments are a list to step through instead.
// On a phone the caption is a toast over the page. Markup and classes are the walkthrough's own.
import { MkPortal } from './Portal'
import { copy } from '../briefing/copy'
import type { Moment } from '../replay/model'
import type { Replay } from '../replay/useReplay'

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`

export function ReplayBar({ r, moments, phone }: { r: Replay; moments: Moment[]; phone: boolean }) {
  if (!r.on) return null
  const cap = r.cur?.txt ?? ''
  const [at, ...rest] = cap.split(' · ')
  return (
    <MkPortal>
      <div className={`rpbar${r.reduced ? ' rm' : ''}`} role="region" aria-label={copy.replayBar}>
        <div className="rpcap" aria-live="polite">
          {r.reduced ? copy.replayList : cap}
        </div>
        {r.reduced && (
          <ol className="rplist">
            {moments.map((m) => (
              <li key={m.min}>
                <button type="button" onClick={() => r.pick(m)}>
                  <span className="t">{m.txt.split(' · ')[0]}</span>
                  <span>{m.txt.split(' · ').slice(1).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="rprow">
          {!r.reduced && (
            <>
              <button type="button" id="rpPlay" aria-label={r.playing ? copy.pause : copy.play} onClick={r.toggle}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <path d={r.playing ? 'M2 1h3v10H2zM7 1h3v10H7z' : 'M2.5 1.2v9.6L10.5 6z'} />
                </svg>
              </button>
              <span className="rpclk mono">{hm(r.t)}</span>
              <input className="rpscr" type="range" min={0} max={r.end} step={1} value={Math.round(r.t)} aria-label={copy.scrub} onChange={(e) => r.seek(Number(e.target.value))} />
              <button type="button" id="rpSpd" aria-label={copy.speed} onClick={r.faster}>
                {r.speed}&times;
              </button>
            </>
          )}
          <button type="button" id="rpX" aria-label={copy.closeReplay} onClick={r.close}>
            &times;
          </button>
        </div>
      </div>
      {phone && !r.reduced && (
        <div className={`mk-toast rpt${cap ? ' on' : ''}`}>
          <div className="ic">{'▶'}</div>
          <div>
            <b>{rest.join(' · ')}</b>
            <span>{at}</span>
          </div>
        </div>
      )}
    </MkPortal>
  )
}
