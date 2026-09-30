// The honest version of "are you sure?": what cookieless mode changes, as one
// small comparison, before it is switched on (or back off). Cancel is the
// default, because nothing is lost by it.
import { Cookie, ExternalLink } from 'lucide-react'
import { useRef } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../components/Modal'
import { CookielessTable } from './CookielessTable'
import { copy } from './copy'
import { PRIVACY_DOCS } from './snippet'
import { useFocusTrap } from './useFocusTrap'
import '../../components/ConfirmDialog.css'
import './CookielessDialog.css'

const t = copy.cookieless

/** `on`: the site is cookieless now, so this asks to go back to cookies. */
export function CookielessDialog({ on, onCancel, onConfirm }: { on: boolean; onCancel: () => void; onConfirm: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box)
  const title = on ? t.dialogTitleOff : t.dialogTitle
  return (
    <Modal label={title} className="confirm-modal cl-modal" onClose={onCancel} keepSize={false}>
      <div ref={box} className="confirm-body cl-dialog">
        <DialogHead icon={Cookie} heading={title} />
        <CookielessTable toCookies={on} />
        <p className="faint cl-back">
          {t.switchBack}{' '}
          <a className="inst-docs" href={PRIVACY_DOCS} target="_blank" rel="noreferrer">
            {t.docsLink}
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
          </a>
        </p>
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onCancel} autoFocus>
              {t.cancel}
            </button>
          }
        >
          <button type="button" className="btn primary big" onClick={onConfirm}>
            {on ? t.confirmOff : t.confirm}
          </button>
        </DialogActions>
      </div>
    </Modal>
  )
}
