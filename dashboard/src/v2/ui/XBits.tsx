// The small parts of an Explore page: a titled line, a quiet note, an empty message, a row that asks to connect, the
// segmented switch inside a section, and the loading shape.
import type { ReactNode } from 'react'
import { Ico } from './icons'

export function XSec({ a, b }: { a: ReactNode; b?: ReactNode }) {
  return (
    <div className="xsec">
      <span>{a}</span>
      {b !== undefined && <span>{b}</span>}
    </div>
  )
}

export const XNote = ({ children }: { children: ReactNode }) => <div className="xnote">{children}</div>

export function XEmpty({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="xempty">
      <b>{title}</b>
      <span>{hint}</span>
      {children}
    </div>
  )
}

export interface SetupText {
  t: string
  d: string
  b: string
}

/** A row that says what is not connected, with the way to do it and how it works. */
export function XSetup({ icon, x, howLabel, onSet, onHow }: { icon: string; x: SetupText; howLabel: string; onSet: () => void; onHow: () => void }) {
  return (
    <div className="mk-srow big">
      <Ico name={icon} className="ic-i" />
      <span className="st2">
        <b>{x.t}</b> {x.d}
      </span>
      <span className="sa">
        <button type="button" className="xb" onClick={onSet}>
          {x.b}
        </button>
        <button type="button" className="lk3 how" onClick={onHow}>
          {howLabel}
        </button>
      </span>
    </div>
  )
}

export interface SubItem<T extends string> {
  key: T
  label: string
  dot?: string
}

/** Two to four views of one thing, side by side: the tabs of a section, the kinds of sale. */
export function XSub<T extends string>({ items, value, label, attr, onPick }: { items: SubItem<T>[]; value: T; label: string; attr: string; onPick: (k: T) => void }) {
  return (
    <div className="xsub" role="tablist" aria-label={label} style={{ '--n': items.length } as React.CSSProperties}>
      {items.map((x) => (
        <button key={x.key} type="button" role="tab" aria-selected={x.key === value} {...{ [`data-${attr}`]: x.key }} className={x.key === value ? 'on' : ''} onClick={() => onPick(x.key)}>
          {x.label}
          {x.dot && <i className="xdot" title={x.dot} />}
        </button>
      ))}
    </div>
  )
}

/** What a section shows while its numbers are on the way. */
export function XSkeleton({ cards, label }: { cards: number; label: string }) {
  return (
    <div className="xsk" role="status" aria-label={label}>
      {cards > 0 && (
        <div className={`kcs xk${cards === 3 ? ' k3' : ''}`}>
          {Array.from({ length: cards }, (_, i) => (
            <i key={i} className="sk kcsk" />
          ))}
        </div>
      )}
      <i className="sk sh" />
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} className="sk rw" />
      ))}
    </div>
  )
}
