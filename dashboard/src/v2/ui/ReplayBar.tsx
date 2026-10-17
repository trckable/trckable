// The bar at the bottom while the day is played back: what the line has reached, in a word. It sits over the page
// (fixed), so it moves nothing. With reduced motion the moments are a list to step through instead, with a way out.
// On a phone the caption is a toast over the page. Markup and classes are the walkthrough's own.
import { MkPortal } from './Portal'
import { copy } from '../briefing/copy'
import type { Moment } from '../replay/model'
import type { Replay } from '../replay/useReplay'

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
          <>
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
            <div className="rprow">
              <button type="button" id="rpX" aria-label={copy.closeReplay} onClick={r.close}>
                &times;
              </button>
            </div>
          </>
        )}
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
