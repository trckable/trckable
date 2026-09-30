// A question inside a row, answered in place: a short line and two buttons.
// Escape steps back out of it and nothing else: the dialog around it stays.
import { useEffect } from 'react'
import { copy } from './copy'

interface Props {
  text: string
  yes: string
  busyText: string
  busy: boolean
  /** The yes button is red for what cannot be undone. */
  danger?: boolean
  onNo: () => void
  onYes: () => void
}

export function Ask({ text, yes, busyText, busy, danger, onNo, onYes }: Props) {
  useEffect(() => {
    if (busy) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onNo()
    }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [busy, onNo])
  return (
    <span className="sl-ask" role="group" aria-label={text}>
      <span>{text}</span>
      <button type="button" className="btn ghost small" autoFocus disabled={busy} onClick={onNo}>
        {copy.keep}
      </button>
      <button type="button" className={danger ? 'btn danger small' : 'btn primary small'} disabled={busy} onClick={onYes}>
        {busy ? busyText : yes}
      </button>
    </span>
  )
}
