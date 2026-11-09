// One section of the panel: its title and, while closed, one line of what it is set to. One is open at a time.
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = { id: string; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }

export function Section({ id, title, summary, open, onToggle, children }: Props) {
  return (
    <section className={'sd-sec' + (open ? ' is-open' : '')}>
      <button type="button" className="sd-sec-head" id={`sd-h-${id}`} aria-expanded={open} aria-controls={`sd-b-${id}`} onClick={onToggle}>
        <b>{title}</b>
        <span className="sd-sec-sum">{summary}</span>
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="sd-sec-body" id={`sd-b-${id}`} role="region" aria-labelledby={`sd-h-${id}`}>
          {children}
        </div>
      )}
    </section>
  )
}
