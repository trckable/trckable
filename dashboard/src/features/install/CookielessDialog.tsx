// The honest version of "are you sure?": what cookieless mode changes, as one
// small comparison, before it is switched on (or back off). Cancel is the
// default, because nothing is lost by it.
import { Cookie, ExternalLink } from 'lucide-react'
import { Modal } from '../../kit/Modal'
import { ModalMark } from '../../kit/ModalMark'
import { CookielessTable } from './CookielessTable'
import { copy } from './copy'
import { PRIVACY_DOCS } from './snippet'
import './CookielessDialog.css'

const t = copy.cookieless

/** `on`: the site is cookieless now, so this asks to go back to cookies. */
export function CookielessDialog({ on, onCancel, onConfirm }: { on: boolean; onCancel: () => void; onConfirm: () => void }) {
  const title = on ? t.dialogTitleOff : t.dialogTitle
  return (
    <Modal
      label={title}
      onClose={onCancel}
      keepSize={false}
      frame={{
        title,
        icon: <ModalMark icon={Cookie} />,
        size: 'md',
        cancel: t.cancel,
        actions: (
          <button type="button" className="btn primary big" onClick={onConfirm}>
            {on ? t.confirmOff : t.confirm}
          </button>
        ),
      }}
    >
      <CookielessTable toCookies={on} />
      <p className="faint cl-back">
        {t.switchBack}{' '}
        <a className="inst-docs" href={PRIVACY_DOCS} target="_blank" rel="noreferrer">
          {t.docsLink}
          <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </p>
    </Modal>
  )
}
