// A locked card: one line on what the feature would show, one on what it asks for, and the one way in that sets it up. No
// example figures stand in it. A slim row under the Briefing's cards, a big card in Explore: one component, two sizes.
import { useId } from 'react'
import { shippedNames } from '../../lib/payProviders'
import { lockCopy, type LockKind } from './lockCopy'
import './lockCard.css'

export interface LockCardProps {
  kind: LockKind
  size?: 'row' | 'big'
  /** The button (what the feature asks for: "Connect", "Turn on"). */
  go: string
  /** Missing for someone who may not set it up: the card then asks them to turn to an Owner or Admin. */
  onGo?: () => void
  onHow: () => void
}

export function LockCard({ kind, size = 'row', go, onGo, onHow }: LockCardProps) {
  const id = useId()
  const c = lockCopy
  const text = { line: c[`${kind}Line`], sub: kind === 'rev' ? c.revSub(shippedNames()) : c[`${kind}Sub`] }
  return (
    <section className={`lkc ${size}`} data-lock={kind}>
      <div className="lkc-o" role="region" aria-labelledby={id}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <p className="lt1" id={id}>
          {text.line}
        </p>
        <p className="lt2">{text.sub}</p>
        {onGo ? (
          <button type="button" className="lkgo" onClick={onGo}>
            {go}
          </button>
        ) : (
          <p className="lt2 lkask">{c.ask}</p>
        )}
        {size === 'big' && (
          <button type="button" className="lk3 how" onClick={onHow}>
            {c.how}
          </button>
        )}
      </div>
    </section>
  )
}
