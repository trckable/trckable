// The small parts of an Explore page: a titled line, a quiet note, an empty message, a row that asks to connect, the
// segmented switch inside a section, and the loading shape.
import { useEffect, useRef, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { copy } from '../explore/copy'

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

/** A read that failed: an icon, one line on what, why when the server said, and the way to try again. */
export function XError({ title, hint, onRetry }: { title: string; hint?: string; onRetry: () => void }) {
  return (
    <div className="xempty xerr" role="alert">
      <CircleAlert aria-hidden="true" />
      <b>{title}</b>
      {hint && <span>{hint}</span>}
      <button type="button" className="xb" onClick={onRetry}>
        {copy.retry}
      </button>
    </div>
  )
}

interface SubItem<T extends string> {
  key: T
  label: string
  dot?: string
}

/** Two to four views of one thing, side by side: the tabs of a section, the kinds of sale. */
export function XSub<T extends string>({ items, value, label, attr, onPick }: { items: SubItem<T>[]; value: T; label: string; attr: string; onPick: (k: T) => void }) {
  const strip = useRef<HTMLDivElement>(null)
  // On a phone the strip scrolls: the tab that is open is kept in view.
  useEffect(() => {
    const el = strip.current
    const on = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el && on && el.scrollWidth > el.clientWidth) el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2 })
  }, [value])
  return (
    <div ref={strip} className="xsub" role="tablist" aria-label={label} style={{ '--n': items.length } as React.CSSProperties}>
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
