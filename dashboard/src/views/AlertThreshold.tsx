import { useState } from 'react'

/** A number that saves when you finish typing it, not on every keystroke:
 *  typing "30" used to save 3 first, and say so twice. */
export function Threshold({ value, label, onSave }: { value: number; label: string; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // A new value from outside shows unless it is being typed over.
  const [seen, setSeen] = useState({ value, editing })
  if (seen.value !== value || seen.editing !== editing) {
    setSeen({ value, editing })
    if (!editing) setText(String(value))
  }
  return (
    <input
      className="input num al-num"
      value={text}
      inputMode="numeric"
      aria-label={label}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const v = Number(text)
        if (Number.isFinite(v) && v !== value) onSave(v)
        else setText(String(value))
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
