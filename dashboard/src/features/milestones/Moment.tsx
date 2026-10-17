// The moment: one line at the top of the dashboard when the site reached a
// milestone. The ghost does its logo hover once, the number counts up, and
// that is all: no confetti, no modal. Reduced motion shows the end at once.
// In the first load, so it is small; the timeline and share sheet are lazy.
import { Share2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Milestone } from '../../lib/api'
import { useTween } from '../../lib/motion'
import { Ghost } from '../../components/Logo'
import { copy } from './copy'
import { say, value } from './words'
import './Moment.css'

export function Moment({ m, onShare, onClose }: { m: Milestone; onShare?: () => void; onClose?: () => void }) {
  const w = say(m)
  // From 0 to the number once mounted: the tween counts it up over 600 ms.
  const [target, setTarget] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the count-up starts once the line is on screen: 0 first, then the number
    setTarget(w.n)
  }, [w.n])
  const n = useTween(target, 600)
  useEffect(() => {
    if (!onClose) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal') && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className={w.money ? 'ms-moment money' : 'ms-moment'} role="status">
      <Ghost size={36} />
      <span className="ms-words">
        {w.big && <b className="ms-num">{value(m.kind, n, m.currency)}</b>}
        <span className="ms-label">{w.label}</span>
      </span>
      {onShare && (
        <button type="button" className="btn primary" onClick={onShare}>
          <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
          {copy.share}
        </button>
      )}
      {onClose && (
        <button type="button" className="btn icon ghost" aria-label={copy.dismiss} onClick={onClose}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
