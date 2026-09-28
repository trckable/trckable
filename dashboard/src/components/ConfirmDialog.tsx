// The confirmation dialog itself (Confirm.tsx has the questions and the host).
import { CircleHelp, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { messageOf } from '../lib/api'
import type { Req } from './Confirm'
import { toast } from './Toast'
import { DialogActions } from './DialogActions'
import { Modal } from './Modal'
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
      .catch((e: unknown) => setErr(messageOf(e) || 'That did not work — try again.'))
      .finally(() => setBusy(false))
  }
  const Mark = req.danger ? TriangleAlert : CircleHelp
  return (
    <Modal label={req.title} className="confirm-modal" onClose={busy ? undefined : () => done(null)}>
      <form className="confirm-body" onSubmit={(e) => { e.preventDefault(); submit() }} aria-busy={busy}>
        <span className={'modal-badge' + (req.danger ? ' danger' : '')} aria-hidden="true">
          <Mark size={20} strokeWidth={1.75} />
        </span>
        <div className="confirm-text">
          <h2>{req.title}</h2>
          {req.body && <p className="muted">{req.body}</p>}
          {err && (
            <p className="confirm-err" role="alert">
              {err}
            </p>
          )}
          {req.field && (
            <label className="field">
              {req.field.label}
              <input
                className="input"
                type={req.field.type ?? 'text'}
                autoComplete={req.field.autoComplete}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )}
        </div>
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={() => done(null)} autoFocus={!req.field} disabled={busy}>
              {req.cancelLabel ?? 'Cancel'}
            </button>
          }
        >
          <button type="submit" className={req.danger ? 'btn danger big' : 'btn primary big'} disabled={busy || (!!req.field && !value)}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? (req.busyLabel ?? 'Working…') : (req.confirmLabel ?? 'Yes')}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
