// Floating panels of the walkthrough render into the page body, in a .mk of their own, so they cover the screen and keep their classes.
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function MkPortal({ children }: { children: ReactNode }) {
  return createPortal(<div className="mk mk-portal">{children}</div>, document.body)
}
