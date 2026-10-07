// A short row of choices, one on (D W M Y). A radio group: arrow keys move the
// choice, and each segment is a finger wide on a phone.
import type { KeyboardEvent } from 'react'
import { kitWords } from './copy'
import './kit.css'

/** Which way a key moves the choice: right or down is forward, left or up back. */
const stepOf = (key: string) => ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 })[key] ?? 0

export function Segmented<T extends string>({ options, value, onChange, label = kitWords.period }: { options: { value: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = stepOf(e.key)
    if (!step) return
    e.preventDefault()
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    onChange(next.value)
    e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[options.indexOf(next)]?.focus()
  }
  return (
    // The arrow keys are the radio group's own behaviour, handled on the group.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- its radios take focus
    <div className="kit-seg" role="radiogroup" aria-label={label} onKeyDown={keys}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
