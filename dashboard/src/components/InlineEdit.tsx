// Editing a name where it is shown: the text and a pencil; a click turns it
// into a field of the same size with ✓ and ×. Enter or ✓ saves, Escape or ×
// puts it back, leaving the field saves a change. While it saves the ✓ spins;
// when it has saved, a tick shows for a moment; if it fails, the field stays
// open with the reason under it. One behaviour everywhere a name is renamed.
import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './InlineEdit.css'

export function InlineEdit({
  value,
  onSave,
  label,
  placeholder,
  size = 'md',
  maxLength = 80,
  required = false,
  editing: startEditing = false,
  onDone,
}: {
  value: string
  onSave: (next: string) => Promise<unknown>
  /** What is being edited, for screen readers: "Your name", "Site name". */
  label: string
  placeholder?: string
  size?: 'md' | 'lg'
  maxLength?: number
  /** An empty value is refused instead of saved. */
  required?: boolean
  /** Open straight into the field (a Rename item in a menu). */
  editing?: boolean
  /** Told when the field closes, saved or not. */
  onDone?: () => void
}) {
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  useEffect(() => {
    if (editing) requestAnimationFrame(() => input.current?.select())
  }, [editing])

  const close = () => {
    setEditing(false)
    setErr(null)
    onDone?.()
  }
  const cancel = () => {
    setDraft(value)
    close()
  }
  const save = () => {
    const next = draft.trim()
    if (busy) return
    if (next === value.trim()) return close()
    if (required && !next) return setErr(`${label} cannot be empty`)
    setBusy(true)
    setErr(null)
    onSave(next)
      .then(() => {
        close()
        setSaved(true)
        setTimeout(() => setSaved(false), 1400)
      })
      .catch((e: Error) => setErr(e.message || 'That did not save — try again.'))
      .finally(() => setBusy(false))
  }

  if (!editing)
    return (
      <span className={'ie ' + size}>
        <button type="button" className="ie-view" onClick={() => setEditing(true)} aria-label={`${label}: ${value || 'not set'}. Edit`}>
          <span className={value ? 'ie-text' : 'ie-text empty'}>{value || placeholder}</span>
          {saved ? <Check size={size === 'lg' ? 16 : 14} strokeWidth={2.25} className="ie-saved" aria-hidden="true" /> : <Pencil size={size === 'lg' ? 15 : 13} strokeWidth={1.75} className="ie-pen" aria-hidden="true" />}
        </button>
      </span>
    )

  return (
    <span className={'ie editing ' + size}>
      <span className="ie-field">
        <input
          ref={input}
          value={draft}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={!!err}
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.preventDefault(), save())
            else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), cancel())
          }}
          onBlur={save}
        />
        {/* mousedown, not click: the field's blur would save first. */}
        <button type="button" className="ie-btn ok" aria-label="Save" disabled={busy} onMouseDown={(e) => (e.preventDefault(), save())}>
          {busy ? <span className="btn-spin" aria-hidden="true" /> : <Check size={15} strokeWidth={2.25} aria-hidden="true" />}
        </button>
        <button type="button" className="ie-btn" aria-label="Cancel" disabled={busy} onMouseDown={(e) => (e.preventDefault(), cancel())}>
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </span>
      {err && (
        <span className="ie-err" role="alert">
          {err}
        </span>
      )}
    </span>
  )
}
