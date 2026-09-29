// The Data view's second row. A wide screen: Live/Data on the left, two
// capsules on the right (what you see: period, comparison, Filter, and the
// fold toggle at the end; what you do: Share, ⋯), the filters in force as chips under the row. A phone: one
// line, a pill that says what the numbers are and opens a sheet, and ⋯.
// The parts come in as nodes: what they show and do is theirs.
import type { ReactNode } from 'react'
import { ViewSwitch } from '../live/ViewSwitch'
import { isShared } from '../../lib/me'
import { PhoneRow, type PhoneProps } from './PhoneRow'
import { FoldToggle } from './FoldToggle'
import { useRowCollapsed } from './rowCollapsed'
import './ControlRow.css'

interface Props extends Omit<PhoneProps, 'more' | 'filter' | 'period' | 'under'> {
  live: boolean
  phone: boolean
  period: ReactNode
  filter?: ReactNode
  share?: ReactNode
  more: ReactNode
  /** The chips of the filters in force and the saved views. */
  under?: ReactNode
}

export function ControlRow(p: Props) {
  const collapsed = useRowCollapsed()
  // Live keeps only the switch; on a phone Data keeps a pill instead of it.
  if (p.phone && !p.live) return <PhoneRow {...p} />
  return (
    <>
      <div className="subbar">
        {!isShared() && <ViewSwitch live={p.live} />}
        {!p.live && (
          <>
            <div className={collapsed ? 'ctl-cap ctl-see collapsed' : 'ctl-cap ctl-see'}>
              {p.period}
              {p.filter && <span className="ctl-div" />}
              {p.filter}
              <span className="ctl-div" />
              <FoldToggle value={p.value} today={p.today} filters={p.active.length} />
            </div>
            <div className="ctl-cap ctl-do">
              {p.share}
              {p.share && <span className="ctl-div" />}
              {p.more}
            </div>
          </>
        )}
      </div>
      {!p.live && p.under && <div className="ctl-under">{p.under}</div>}
    </>
  )
}
