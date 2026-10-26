// The standard header, body and footer of a Modal (its `frame`).
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ActionRow } from '../components/ActionRow'
import { Info } from '../components/Info'

/** The one frame: header (icon, title, subtitle, close), body, footer. A dialog that passes `title` gets all three;
 *  one that does not (a window, a sheet with its own chrome) brings its own inside the same surface. */
export type Frame = {
  title: ReactNode
  subtitle?: ReactNode
  /** A mark beside the title: an icon tile or a provider mark. */
  icon?: ReactNode
  /** The one primary action, last on the right. A submit button when `onSubmit` is set. */
  actions?: ReactNode
  /** A quiet text action at the far left of the footer. */
  extra?: ReactNode
  /** The way out, left of the primary. False for a dialog that has only a primary. */
  cancel?: string | false
  /** Wraps header, body and footer in one form. */
  onSubmit?: () => void
  help?: string
  /** Small controls left of the close button (a Reset pill). */
  tools?: ReactNode
  busy?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Framed({ f, onClose, children }: { f: Frame; onClose?: () => void; children?: ReactNode }) {
  const inner = (
    <>
      <header className="modal-head">
        {f.icon}
        <div className="modal-head-text">
          <h2>
            {f.title}
            {f.help && <Info text={f.help} />}
          </h2>
          {f.subtitle && <span className="faint">{f.subtitle}</span>}
        </div>
        {f.tools}
        {onClose && (
          <button type="button" className="modal-close" aria-label="Close" title="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="modal-body">{children}</div>
      {(f.actions || f.extra || f.cancel !== false) && (
        <footer className="modal-foot">
          {f.extra}
          <ActionRow
            left={
              f.cancel === false ? undefined : (
                <button type="button" className="btn ghost" onClick={onClose} disabled={!onClose || f.busy}>
                  {f.cancel ?? 'Cancel'}
                </button>
              )
            }
          >
            {f.actions}
          </ActionRow>
        </footer>
      )}
    </>
  )
  return f.onSubmit ? (
    <form
      className="modal-form"
      aria-busy={f.busy}
      onSubmit={(e) => {
        e.preventDefault()
        f.onSubmit?.()
      }}
    >
      {inner}
    </form>
  ) : (
    inner
  )
}

