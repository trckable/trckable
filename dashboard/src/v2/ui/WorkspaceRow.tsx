// The account line at the top of the site menu. A build with several accounts gives it a list: the line opens it in place,
// inside the same pane, so switching account never needs a second menu.
import { useState, type ReactNode } from 'react'

export interface Workspace {
  name: string
  d: string
  run?: () => void
  /** The workspace's own mark, before its name. */
  mark?: ReactNode
  /** The accounts to switch between (and what belongs with them), drawn under the line when it is open. */
  accounts?: (close: () => void) => ReactNode
}

export function WorkspaceRow({ w, close }: { w: Workspace; close: () => void }) {
  const [open, setOpen] = useState(false)
  const press = () => {
    if (w.accounts) {
      setOpen((o) => !o)
      return
    }
    w.run?.()
    close()
  }
  return (
    <>
      <button type="button" className={`mi ws${open ? ' open' : ''}`} aria-expanded={w.accounts ? open : undefined} onClick={press}>
        {w.mark}
        <span className="mt2">
          <div className="nm">{w.name}</div>
          <div className="d">{w.d}</div>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" fill="none" strokeWidth="1.5" />
        </svg>
      </button>
      {open && w.accounts && <div className="ws-list">{w.accounts(close)}</div>}
    </>
  )
}
