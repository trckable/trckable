// The quiet rows under the cards: what else was normal, the next step, and what is not set up yet.
import type { ReactNode } from 'react'
import { copy } from '../briefing/copy'
import { DOCS } from '../../components/footerLinks'
import { LockCard } from './LockCard'
import type { LockKind } from './lockCopy'

const lead = (cards: boolean, names: string[], learning: boolean): string => {
  // Nothing is called normal before the site has a normal to be told against.
  if (learning) return copy.stillLearning
  if (!cards) return copy.wasNormal
  // One topic left is said on its own ("Search looked normal"), not as "everything else: search".
  if (names.length === 1) return copy.oneNormal(names[0].charAt(0).toUpperCase() + names[0].slice(1))
  return names.length ? copy.allNormal : copy.nothingElse
}

export function Calm({ cards, names, paused, learning, onExplore }: { cards: boolean; names: string[]; paused: boolean; learning: boolean; onExplore: () => void }) {
  return (
    <div className="calm2">
      <span className="ck">&#10003;</span>
      <span>
        {paused ? (
          <>
            <b>{copy.paused}</b> {copy.pausedRest}
          </>
        ) : (
          <>
            <b>{lead(cards, names, learning)}</b>
            {names.length > (cards ? 1 : 0) && !learning ? `: ${names.join(', ')}` : ''}.
          </>
        )}
      </span>
      <button type="button" onClick={onExplore}>
        {copy.exploreAll} {'\u203A'}
      </button>
    </div>
  )
}

export function Act({ text, rest, label, onAct }: { text: string; rest?: string; label: string; onAct: () => void }) {
  return (
    <div className="act">
      <span>
        <b>{text}</b> {rest}
      </span>
      <button type="button" className="actbtn" onClick={onAct}>
        {label}
      </button>
    </div>
  )
}

export interface Setup {
  key: string
  b: string
  act?: () => void
}

/** One thing not set up yet, as the locked preview of what it would show. */
function SetupLock({ s, size }: { s: Setup; size?: 'card' | 'big' | 'mini' }) {
  return <LockCard kind={s.key as LockKind} size={size} go={s.b} onGo={s.act} onHow={() => window.open(DOCS, '_blank', 'noopener')} />
}

export function Setups({ rows }: { rows: Setup[] }): ReactNode {
  if (rows.length === 0) return null
  return (
    <div className="cards lkcs">
      {rows.map((r) => (
        <SetupLock key={r.key} s={r} />
      ))}
    </div>
  )
}
