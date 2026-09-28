// Settings a viewer may read but not change: one fieldset, disabled for
// anyone who is not an owner, so every switch, field and save inside it is
// greyed out at once instead of each control remembering to check.
import type { ReactNode } from 'react'
import { canChange } from '../lib/me'

export function Locked({ children }: { children: ReactNode }) {
  return (
    <fieldset className="locked" disabled={!canChange()}>
      {children}
    </fieldset>
  )
}
