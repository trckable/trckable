// The confirmation dialog itself (Confirm.tsx has the questions and the host).
import { CircleHelp, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { Req } from './Confirm'
import { toast } from './Toast'
import { Field } from './Field'
import { Modal } from '../kit/Modal'
import { fail, refused, wrong } from '../lib/api'
import './ConfirmDialog.css'

export default function ConfirmDialog({ req, done }: { req: Req; done: (v: string | null) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = () => {
    if (req.field && !value) return
    const v = req.field ? value : ''
    if (!req.run) {
      done(v)
      return
    }
    setBusy(true)
    setErr(null)
    req
      .run(v)
      .then(() => {
        if (req.done) toast(req.done)
        done(v)
      })
      .catch((e: unknown) => {
        // A refused answer to the question itself (a wrong password) stays at the field; anything else is a toast.
        if (req.field && refused(e)) setErr(wrong)
        else fail(e)
      })
      .finally(() => setBusy(false))
  }
  const Mark = req.danger ? TriangleAlert : CircleHelp
  return (
    <Modal
      label={req.title}
      className="confirm-modal"
      over
      onClose={busy ? undefined : () => done(null)}
      frame={{
        title: req.title,
        icon: (
          <span className={'modal-badge' + (req.danger ? ' danger' : '')} aria-hidden="true">
            <Mark size={19} strokeWidth={1.75} />
          </span>
        ),
        size: 'sm',
        busy,
        cancel: req.cancelLabel ?? 'Cancel',
        onSubmit: submit,
        actions: (
          <button type="submit" className={req.danger ? 'btn danger big' : 'btn primary big'} disabled={busy || (!!req.field && !value)}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? (req.busyLabel ?? 'Working…') : (req.confirmLabel ?? 'Yes')}
          </button>
        ),
      }}
    >
      {req.body && <p className="muted confirm-lead">{req.body}</p>}
      {req.field && (
        <Field label={req.field.label} error={err}>
          {(f) => <input {...f} className="input" type={req.field?.type ?? 'text'} autoComplete={req.field?.autoComplete} autoFocus value={value} onChange={(e) => { setValue(e.target.value); setErr(null) }} />}
        </Field>
      )}
    </Modal>
  )
}
