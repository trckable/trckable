// A locked card: one line on what the feature would show, one on what it asks for, and the one button that sets it up. No
// example figures stand in it. In the Briefing's grid, in Explore (big) and in Live (mini): one card, three sizes.
import { useId } from 'react'
import { lockCopy, type LockKind } from './lockCopy'

export interface LockCardProps {
  kind: LockKind
  size?: 'card' | 'big' | 'mini'
  /** The button (what the feature asks for: "Connect", "Turn on"). */
  go: string
  onGo: () => void
  onHow: () => void
}

export function LockCard({ kind, size = 'card', go, onGo, onHow }: LockCardProps) {
  const id = useId()
  const c = lockCopy
  const text = { line: c[`${kind}Line`], sub: c[`${kind}Sub`] }
  return (
    <section className={`lkc${size === 'card' ? '' : ` ${size}`}`} data-lock={kind}>
      <div className="lkc-o" role="region" aria-labelledby={id}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <p className="lt1" id={id}>
          {text.line}
        </p>
        <p className="lt2">{text.sub}</p>
        <button type="button" className="lkgo" onClick={onGo}>
          {go}
        </button>
        <button type="button" className="lk3 how" onClick={onHow}>
          {c.how}
        </button>
      </div>
    </section>
  )
}
