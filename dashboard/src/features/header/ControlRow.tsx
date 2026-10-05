// The Data view's second row. A wide screen: two
// capsules on the right (what you see: period, comparison, Filter, and the
// fold toggle at the end; what you do: Share, ⋯), the filters in force as chips on
// the left of the same row (under it on a tablet, and in a shared link's header).
// Folding runs the first capsule's width to zero, so what it holds sits in a
// clip-free wrapper (.ctl-fw > .ctl-fi) that only clips while it moves. A phone: one
// line, a pill that says what the numbers are and opens a sheet, and ⋯.
// The parts come in as nodes: what they show and do is theirs.
import type { ReactNode } from 'react'
import { ViewSwitch } from '../live/ViewSwitch'
import { isShared } from '../../lib/me'
import { PhoneRow, type PhoneProps } from './PhoneRow'
import { FoldToggle } from './FoldToggle'
import { useWide } from './useWide'
import { useRowCollapsed, useRowMoving } from './rowCollapsed'
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
  const moving = useRowMoving()
  const wide = useWide()
  // Live keeps only the switch; on a phone Data keeps a pill instead of it.
  if (p.phone && !p.live) return <PhoneRow {...p} />
  // A desktop has the switch in the header, so Live has nothing left here.
  if (wide && p.live) return null
  // A desktop's row has room on the left now that Live/Data sits in the header.
  const inline = wide && !isShared()
  return (
    <>
      <div className="subbar">
        {!isShared() && !wide && <ViewSwitch live={p.live} />}
        {!p.live && <div id="sv-slot" className="sv-slot" />}
        {!p.live && (
          <>
            {inline && p.under && <div className="ctl-inline">{p.under}</div>}
            <div className={['ctl-cap ctl-see', collapsed && 'collapsed', moving && 'moving'].filter(Boolean).join(' ')}>
              <div className="ctl-fw">
                <div className="ctl-fi" inert={collapsed}>
                  {p.period}
                  {p.filter}
                </div>
              </div>
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
      {!p.live && !inline && p.under && <div className="ctl-under">{p.under}</div>}
    </>
  )
}
