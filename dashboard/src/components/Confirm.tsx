// Our own confirmation dialog. The browser's confirm() is blocked in embedded
// browsers and some app shells, so a destructive action could silently do
// nothing — and it looks nothing like the rest of trckable.
import { useCallback, useState } from 'react'
import { DialogActions } from './DialogActions'
import { Modal } from './Modal'

type Ask = { title: string; body?: string; confirmLabel?: string; danger?: boolean }

export function useConfirm() {
  const [req, setReq] = useState<(Ask & { resolve: (ok: boolean) => void }) | null>(null)
  const ask = useCallback((o: Ask) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), [])
  const done = (ok: boolean) => {
    req?.resolve(ok)
    setReq(null)
  }
  const dialog = req ? <ConfirmDialog req={req} done={done} /> : null
  return { ask, dialog }
}

function ConfirmDialog({ req, done }: { req: Ask; done: (ok: boolean) => void }) {
  return (
    <Modal label={req.title} onClose={() => done(false)}>
      <h2>{req.title}</h2>
      {req.body && (
        <p className="muted" style={{ margin: 0 }}>
          {req.body}
        </p>
      )}
      <DialogActions
        left={
          <button type="button" className="btn ghost" onClick={() => done(false)} autoFocus>
            Cancel
          </button>
        }
      >
        <button type="button" className={req.danger ? 'btn danger big' : 'btn primary big'} onClick={() => done(true)}>
          {req.confirmLabel ?? 'Yes'}
        </button>
      </DialogActions>
    </Modal>
  )
}
