import { X } from 'lucide-react'
import { useState } from 'react'
import { Field } from '../../components/Field'
import { trust } from './trustCopy'

const sameWord = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** A list of words as chips, with an input to add one. The parent keeps the list. */
export function ChipList({ label, help, values, max, readOnly, onChange }: { label: string; help: string; values: string[]; max: number; readOnly: boolean; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const w = draft.trim()
    if (w && values.length < max && !values.some((x) => sameWord(x, w))) onChange([...values, w])
    setDraft('')
  }
  return (
    <div className="mentions-rule">
      {values.length > 0 && (
        <ul className="mentions-words">
          {values.map((w) => (
            <li key={w} className="mentions-word">
              {w}
              {!readOnly && (
                <button type="button" aria-label={trust.removeEntry(w)} onClick={() => onChange(values.filter((x) => x !== w))}>
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <Field label={label} help={help}>
          {(p) => (
            <div className="mentions-add">
              <input
                {...p}
                className="input"
                value={draft}
                maxLength={60}
                disabled={values.length >= max}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
              />
              <button type="button" className="btn" disabled={!draft.trim() || values.length >= max} onClick={add}>
                {trust.addEntry}
              </button>
            </div>
          )}
        </Field>
      )}
    </div>
  )
}
