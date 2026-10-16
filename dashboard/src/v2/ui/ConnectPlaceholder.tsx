// The quiet rows under the cards: what else was normal, the next step, and what is not set up yet.
import { useState, type ReactNode } from 'react'
import { Ico } from './icons'
import { copy } from '../briefing/copy'

const lead = (cards: boolean, some: boolean): string => {
  if (!cards) return copy.wasNormal
  return some ? copy.allNormal : copy.nothingElse
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
            <b>{lead(cards, names.length > 0)}</b>
            {names.length && !learning ? `: ${names.join(', ')}` : ''}.
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
  icon: string
  t: string
  d: string
  b: string
  how: string
  act: () => void
}

export function SetupRow({ s, big }: { s: Setup; big?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`mk-srow${big ? ' big' : ''}`}>
      <Ico name={s.icon} className="ic-i" />
      <span className="st2">
        <b>{s.t}</b> {s.d}
      </span>
      <span className="sa">
        <button type="button" className="xb" onClick={s.act}>
          {s.b}
        </button>
        <button type="button" className="lk3 how" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? copy.hideHow : copy.howWorks}
        </button>
      </span>
      {open && <p className="mk-quiet">{s.how}</p>}
    </div>
  )
}

export function Setups({ rows }: { rows: Setup[] }): ReactNode {
  if (rows.length === 0) return null
  return (
    <div className="setups">
      {rows.map((r) => (
        <SetupRow key={r.key} s={r} />
      ))}
    </div>
  )
}
