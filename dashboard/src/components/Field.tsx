// One field: the label above, the input under it at the full width, the
// error right under the input, and an optional "?" tooltip for the one thing
// worth explaining. The input comes in as a function so it gets the ids that
// tie the label, the hint and the error to it.
import { useId, type ReactNode } from 'react'
import { FieldError } from '../kit/FieldError'
import { Info } from './Info'
import './Field.css'

export interface FieldProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/** `plain`: the control names itself (a picker), so the label is only text. */
export function Field({ label, help, error, plain, children }: { label: string; help?: string; error?: string | null; plain?: boolean; children: (p: FieldProps) => ReactNode }) {
  const id = useId()
  const errId = id + '-err'
  return (
    <div className="dlg-field">
      <span className="dlg-field-label">
        {plain ? <span>{label}</span> : <label htmlFor={id}>{label}</label>}
        {help && <Info text={help} />}
      </span>
      {children({ id, 'aria-describedby': error ? errId : undefined, 'aria-invalid': error ? true : undefined })}
      <FieldError id={errId} error={error} />
    </div>
  )
}
