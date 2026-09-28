// The honest version of "are you sure?": what cookieless mode costs, before
// it is switched on. Cancel is the default, because nothing is lost by it.
import { Cookie, ExternalLink } from 'lucide-react'
import { useRef } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { Modal } from '../../components/Modal'
import { copy } from './copy'
import { PRIVACY_DOCS } from './snippet'
import { useFocusTrap } from './useFocusTrap'
import '../../components/ConfirmDialog.css'

const t = copy.cookieless

export function CookielessDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box)
  return (
    <Modal label={t.dialogTitle} className="confirm-modal" onClose={onCancel} keepSize={false}>
      <div ref={box} className="confirm-body inst-cl-dialog">
        <span className="modal-badge" aria-hidden="true">
          <Cookie size={20} strokeWidth={1.75} />
        </span>
        <div className="confirm-text">
          <h2>{t.dialogTitle}</h2>
          <p className="muted">{t.dialogIntro}</p>
          <ul className="inst-cl-points">
            {t.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <a className="inst-docs" href={PRIVACY_DOCS} target="_blank" rel="noreferrer">
            {t.docsLink}
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
          </a>
        </div>
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onCancel} autoFocus>
              {t.cancel}
            </button>
          }
        >
          <button type="button" className="btn primary big" onClick={onConfirm}>
            {t.confirm}
          </button>
        </DialogActions>
      </div>
    </Modal>
  )
}
