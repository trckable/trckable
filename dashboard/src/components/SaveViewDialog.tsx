// Name the view you are looking at, to come back to it (Dashboard's saved views).
import { useState } from 'react'
import { DialogActions } from './DialogActions'
import { DialogHead } from './DialogHead'
import { Field } from './Field'
import { Modal } from '../kit/Modal'
import { saveViewCopy as copy } from './saveViewCopy'

/** Name the view you are looking at. It says what will be kept — the period,
 *  the filters, the mode — so nobody saves one thing expecting another. */
export function SaveViewDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal label={copy.label} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          setBusy(true)
          onSave(n)
        }}
      >
        <DialogHead heading={copy.title} hint={copy.hint} help={copy.help} />
        <Field label={copy.name}>
          {(f) => <input {...f} className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={copy.placeholder} autoFocus />}
        </Field>
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              {copy.cancel}
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !name.trim()}>
            {busy ? copy.saving : copy.save}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
