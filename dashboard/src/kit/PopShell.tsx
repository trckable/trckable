// The one shell of every header menu (bell, apps, account): the frame (popShell.css), an optional head row (title left,
// actions right) and an optional foot row (a divider, one thing on the left and one on the right in the same text style).
// A menu draws its own content only; popShellGuard.test.ts fails on a header menu that draws a frame of its own.
import type { ReactNode } from 'react'
import './popShell.css'

/** The class of the menu's box: the frame and the tokens (they come with the mock's colours, so a menu on the top layer has them too). */
export const SHELL = 'pshell mk-tokens'

export function PopHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="pshell-head">
      <b>{title}</b>
      {children && <span className="pshell-acts">{children}</span>}
    </div>
  )
}

export function PopFoot({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <div className="pshell-foot">
      {start ?? <span />}
      {end}
    </div>
  )
}
