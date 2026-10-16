// One card opened in place: its sentence, its picture, why, how we know, and the way into Explore. A drawer on a wide
// screen, a sheet from the bottom on a phone; Escape and the scrim close it.
import { useEffect, useRef } from 'react'
import { Ico } from './icons'
import { MkPortal } from './Portal'
import { Visual, type CardCtx } from './StoryCard'
import { copy } from '../briefing/copy'
import type { Story } from '../briefing/model'

export function Detail({ s, site, c, onClose }: { s: Story; site: string; c: CardCtx; onClose: () => void }) {
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    box.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const w = c.watched(s)
  return (
    <MkPortal>
      <div className="xscrim on" onClick={onClose} aria-hidden="true" />
      <aside ref={box} className="cd on" aria-label={copy.detail} tabIndex={-1}>
        <div className="cdh">
          <Ico name={s.key === 'sources' ? 'sources' : s.key} className="ic-i" />
          <b>{copy.detailTitle[s.key]}</b>
          <span className="quiet">{site}</span>
          <button type="button" className="ib x" title={copy.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cdb">
          <h3>
            <b>{s.head}</b>
            {s.tail ? `, ${s.tail}` : ''}
          </h3>
          <Visual s={s} usual={c.usual} who={c.who} />
          <p className="cdw">{s.why}</p>
          <div className="hw show">
            <b>{copy.how}.</b> {c.know(s)}
          </div>
        </div>
        <div className="cdf">
          <button type="button" className="xb p" onClick={() => c.onDeeper(s)}>
            {copy.openExplore}
          </button>
          <button type="button" className="xb" onClick={() => c.onWatch(s)}>
            {w ? copy.watching : copy.watch}
          </button>
        </div>
      </aside>
    </MkPortal>
  )
}
