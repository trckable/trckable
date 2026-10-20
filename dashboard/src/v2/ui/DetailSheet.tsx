// One card opened in place: its sentence, its picture, why, how we know, and the way into Explore. A drawer on a wide
// screen, a sheet from the bottom on a phone; Escape and the scrim close it.
import { useRef } from 'react'
import { useSheet } from './useSheet'
import { Ico } from './icons'
import { MkPortal } from './Portal'
import type { CardCtx } from './StoryCard'
import { Visual } from './StoryVisual'
import { copy } from '../briefing/copy'
import { WhyBody } from './WhyBody'
import type { Story } from '../briefing/cards'

export function Detail({ s, site, c, onClose }: { s: Story; site: string; c: CardCtx; onClose: () => void }) {
  const box = useRef<HTMLElement>(null)
  useSheet(box, onClose)
  const w = c.watched(s)
  const dn = c.done(s)
  return (
    <MkPortal>
      <div className="xscrim on" onClick={onClose} aria-hidden="true" />
      <aside ref={box} className="cd on" aria-label={copy.detail} tabIndex={-1}>
        <div className="cdh">
          <Ico name={s.key === 'milestone' ? 'goals' : s.key} className="ic-i" />
          <b>{copy.detailTitle[s.key]}</b>
          <span className="mk-quiet">{site}</span>
          <button type="button" className="ib x" title={copy.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cdb">
          <h3>
            <b>{s.head}</b>
            {s.rest}
          </h3>
          <Visual s={s} />
          <p className="cdw">{s.why}</p>
          <div className="hw show">
            {s.cause && (
              <WhyBody why={s.cause} />
            )}
            <b>{copy.how}.</b> {s.how} <span className="ev">{s.ev}</span>
          </div>
        </div>
        <div className="cdf">
          {s.act && (
            <button type="button" className={`xb p cact${dn ? ' done' : ''}`} onClick={() => c.onAct(s)}>
              {dn ? copy.doneMark : s.act.t}
            </button>
          )}
          <button type="button" className={`xb${w ? ' on' : ''}`} onClick={() => c.onWatch(s)}>
            {w ? copy.watching : copy.watch}
          </button>
          <button type="button" className="xb" onClick={() => c.onDeeper(s)}>
            {copy.openExplore}
          </button>
        </div>
      </aside>
    </MkPortal>
  )
}
