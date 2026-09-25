// Editing a name where it is shown. The name sits in a box that looks like
// text; on hover the box shows its edge and a pencil, and a click turns the
// same box, at the same size and place, into the field — nothing jumps.
// Enter or ✓ saves, Escape or × puts it back, leaving the field saves a
// change. While it saves the text dims and ✓ spins; once saved, "Saved"
// shows in the box for a moment; a failure keeps the field open and says why.
import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './InlineEdit.css'

export function InlineEdit({
  value,
  onSave,
  label,
  placeholder,
  size = 'md',
  width,
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
  /** A fixed width, for a settings row; left out, the box follows the text. */
  width?: number
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
    if (!editing) return
    const el = input.current
    el?.focus()
    el?.select()
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
        setTimeout(() => setSaved(false), 1600)
      })
      .catch((e: Error) => setErr(e.message || 'That did not save — try again.'))
      .finally(() => setBusy(false))
  }

  const style = width ? { width } : undefined
  return (
    <span className={'ie ' + size}>
      {editing ? (
        <span className={'ie-box edit' + (busy ? ' busy' : '') + (err ? ' bad' : '')} style={style}>
          <input
            ref={input}
            value={draft}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={!!err}
            maxLength={maxLength}
            readOnly={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.preventDefault(), save())
              else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), cancel())
            }}
            onBlur={save}
          />
          {/* mousedown, not click: the field's blur would save first. */}
          <button type="button" className="ie-act ok" aria-label="Save" title="Save (Enter)" onMouseDown={(e) => (e.preventDefault(), save())}>
            {busy ? <span className="btn-spin" aria-hidden="true" /> : <Check size={15} strokeWidth={2.4} aria-hidden="true" />}
          </button>
          <button type="button" className="ie-act" aria-label="Cancel" title="Cancel (Esc)" disabled={busy} onMouseDown={(e) => (e.preventDefault(), cancel())}>
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ) : (
        <button type="button" className="ie-box view" style={style} onClick={() => setEditing(true)} aria-label={`${label}: ${value || 'not set'}. Edit`}>
          <span className={value ? 'ie-text' : 'ie-text empty'}>{value || placeholder}</span>
          {saved ? (
            <span className="ie-saved" aria-live="polite">
              <Check size={13} strokeWidth={2.5} aria-hidden="true" /> Saved
            </span>
          ) : (
            <Pencil size={size === 'lg' ? 15 : 13} strokeWidth={1.75} className="ie-pen" aria-hidden="true" />
          )}
        </button>
      )}
      {err && (
        <span className="ie-err" role="alert">
          {err}
        </span>
      )}
    </span>
  )
}
