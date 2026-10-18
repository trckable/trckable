// Settings a viewer may read but not change: one fieldset, disabled for
// anyone who is not an owner, so every switch, field and save inside it is
// greyed out at once instead of each control remembering to check.
import type { ReactNode } from 'react'
import { can } from '../lib/permissions'

export function Locked({ children }: { children: ReactNode }) {
  return (
    <fieldset className="locked" disabled={!can('site.settings')}>
      {children}
    </fieldset>
  )
}
