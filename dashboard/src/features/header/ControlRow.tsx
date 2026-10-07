// The Data view's one control line, sticky under the page's top: the filters
// in force and Filter on the left, the period on the right, then Share and ⋯.
// While it is stuck it turns to glass and says which site this is. A tablet
// and a shared link's header keep the filter chips in a row under it. A phone:
// one line, a pill that says what the numbers are and opens a sheet, and ⋯.
// The parts come in as nodes: what they show and do is theirs.
import type { ReactNode } from 'react'
import { ViewSwitch } from '../live/ViewSwitch'
import { SiteMark } from '../../components/SiteMark'
import type { Site } from '../../lib/api'
import { isShared } from '../../lib/me'
import { PhoneRow, type PhoneProps } from './PhoneRow'
import { useStuck } from './useStuck'
import { useWide } from './useWide'
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
  /** The site on screen: named at the line's left while it is stuck. */
  site?: Site
}

export function ControlRow(p: Props) {
  const wide = useWide()
  const { sentinel, stuck } = useStuck()
  // Live keeps only the switch; on a phone Data keeps a pill instead of it.
  if (p.phone && !p.live) {
    return (
      <>
        <div ref={sentinel} className="subbar-sentinel" aria-hidden="true" />
        <PhoneRow {...p} stuck={stuck} />
      </>
    )
  }
  // A desktop has the switch in the header, so Live has nothing left here.
  if (wide && p.live) return null
  const inline = wide && !isShared()
  return (
    <>
      <div ref={sentinel} className="subbar-sentinel" aria-hidden="true" />
      <div className="subbar" data-stuck={stuck || undefined}>
        {!isShared() && !wide && <ViewSwitch live={p.live} />}
        {!p.live && <div id="sv-slot" className="sv-slot" />}
        {!p.live && <div id="sv-back" className="sv-back" />}
        {!p.live && p.site && !isShared() && (
          <span className="ctl-site">
            <SiteMark site={p.site} size={16} />
            <b>{p.site.name || p.site.domain}</b>
          </span>
        )}
        {!p.live && (
          <>
            <div className="ctl-inline">
              {inline && p.under}
              {p.filter}
            </div>
            <div className="ctl-cap ctl-see">{p.period}</div>
            <div className="ctl-cap ctl-do">
              {p.share}
              {p.more}
            </div>
          </>
        )}
      </div>
      {!p.live && !inline && p.under && <div className="ctl-under">{p.under}</div>}
    </>
  )
}
