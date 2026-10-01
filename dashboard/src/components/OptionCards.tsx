// A choice between a few things, as a grid of equal cards: an icon, a label
// and a one-line hint on each. It is one radio group: Tab reaches the chosen
// card, the arrow keys move the choice, and the chosen card carries an accent
// border and a soft fill. Two columns on a desktop, one on a phone.
import type { LucideIcon } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import './OptionCards.css'

export interface Option<T extends string> {
  id: T
  label: string
  hint?: string
  icon: LucideIcon
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function OptionCards<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (id: T) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const move = (e: KeyboardEvent, from: number) => {
    const step = STEP[e.key]
    if (!step) return
    e.preventDefault()
    const to = (from + step + options.length) % options.length
    onChange(options[to].id)
    box.current?.querySelectorAll<HTMLElement>('[role=radio]')[to]?.focus()
  }
  return (
    <div ref={box} className="opt-cards" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} tabIndex={value === o.id ? 0 : -1} className="opt-card" onClick={() => onChange(o.id)} onKeyDown={(e) => move(e, i)}>
          <o.icon size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="opt-card-text">
            <span className="opt-card-label">{o.label}</span>
            {o.hint && <span className="opt-card-hint">{o.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}
