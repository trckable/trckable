// One collapsible group of the widget editor: a button with a one-line summary
// of what is set inside, and the settings below it, opening and closing
// smoothly. The groups are an accordion: they start shut, one open at a time,
// and which one is kept for the session, so making a widget and editing one
// open the same.
import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

const KEY = 'trckable.widget-section'

function read() {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** The open group's id ('' when all are shut), and the way to open or shut one. */
export function useAccordion() {
  const [open, setOpen] = useState(read)
  const toggle = (id: string) => {
    const next = open === id ? '' : id
    try {
      sessionStorage.setItem(KEY, next)
    } catch {
      // a browser without storage forgets it at the next load
    }
    setOpen(next)
  }
  return { open, toggle }
}

export function WidgetSection({ summary, open, onToggle, children }: { summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const body = useId()
  return (
    <section className={'wg-sec' + (open ? ' open' : '')}>
      <button type="button" className="wg-sec-head" aria-expanded={open} aria-controls={body} onClick={onToggle}>
        <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
        <span>{summary}</span>
      </button>
      <div id={body} className="wg-sec-body" role="group" aria-label={summary} inert={!open}>
        <div className="wg-sec-inner">{children}</div>
      </div>
    </section>
  )
}
