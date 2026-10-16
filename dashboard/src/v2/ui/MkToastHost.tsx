// Draws the walkthrough's toast (ui/toast.ts) over the page.
import { MkPortal } from './Portal'
import { toasts } from './toast'

export function MkToastHost() {
  const t = toasts.use()
  return (
    <MkPortal>
      <div className={`mk-toast${t ? ' on' : ''}${t?.red ? ' r' : ''}`} role="status" aria-live="polite">
        <div className="ic">{t?.icon}</div>
        <div>
          <b>{t?.title}</b>
          <span>{t?.sub}</span>
        </div>
      </div>
    </MkPortal>
  )
}
