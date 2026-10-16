// "Why?" as a small button that opens the cause, in the walkthrough's own note style, right where it is pressed.
import { useState } from 'react'
import { copy } from '../briefing/copy'
import type { Why } from '../briefing/why'

export function WhyInline({ why }: { why: Why }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="lk3" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {copy.whyQ}
      </button>
      {open && (
        <div className="hw show" style={{ marginTop: 'var(--mk-s2)' }}>
          <b>{copy.whyDot}</b> {why.cause} <span className="ev">{why.todo}</span>
        </div>
      )}
    </>
  )
}
