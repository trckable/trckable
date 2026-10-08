// The one way a form says "no": a small icon and a short sentence under the
// field it is about, left-aligned, in a polite live region that is always on
// the page (a region added together with its text is not announced). The input
// it belongs to gets `fieldProps`: aria-invalid, the id to describe it by, and
// the red border from FieldError.css.
import { AlertCircle } from 'lucide-react'
import './FieldError.css'

/** The attributes an input takes while `error` is set; spread them on the input. */
export function fieldProps(id: string, error?: string | null): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return error ? { 'aria-invalid': true, 'aria-describedby': id } : {}
}

export function FieldError({ id, error, className }: { id: string; error?: string | null; className?: string }) {
  return (
    <div className={'field-err' + (className ? ' ' + className : '')} aria-live="polite" aria-atomic="true">
      {error ? (
        <p id={id} className="field-err-msg">
          <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
