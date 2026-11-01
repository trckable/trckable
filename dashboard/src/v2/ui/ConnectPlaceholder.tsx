// The quiet rows under the cards: what else was normal, the next step, and what is not set up yet.
import type { ReactNode } from 'react'
import { copy } from '../briefing/copy'
import { tag } from '../../i18n'
import './mailLine.css'
import { DOCS } from '../../components/footerLinks'
import { LockCard } from './LockCard'
import type { LockKind } from './lockCopy'

const lead = (cards: boolean, names: string[], learning: boolean): string => {
  // Nothing is called normal before the site has a normal to be told against.
  if (learning) return copy.stillLearning
  if (!cards) return copy.wasNormal
  return names.length ? copy.noOther(new Intl.ListFormat(tag, { type: 'disjunction' }).format(names)) : copy.nothingElse
}

export interface CalmIn {
  cards: boolean
  names: string[]
  paused: boolean
  learning: boolean
}

/** What else was normal, as a line: a tick and the words. The incident card ends with it; without an incident it stands as a row of its own. */
export function CalmLine({ cards, names, paused, learning }: CalmIn) {
  return (
    <>
      <span className="ck">&#10003;</span>
      <span>
        {paused ? (
          <>
            <b>{copy.paused}</b> {copy.pausedRest}
          </>
        ) : (
          <>
            <b>{lead(cards, names, learning)}</b>
          </>
        )}
      </span>
    </>
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
function SetupLock({ s }: { s: Setup }) {
  return <LockCard kind={s.key as LockKind} go={s.b} onGo={s.act} onHow={() => window.open(DOCS, '_blank', 'noopener')} />
}

export function Setups({ rows }: { rows: Setup[] }): ReactNode {
  if (rows.length === 0) return null
  return (
    <div className="lkcs">
      {rows.map((r) => (
        <SetupLock key={r.key} s={r} />
      ))}
    </div>
  )
}
