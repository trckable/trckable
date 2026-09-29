// The control capsule's fold toggle, at its right end after Filter: a fold
// icon (arrows pointing in) while open, an unfold icon (arrows pointing out)
// in the pill it leaves (the period and the filter count; a click opens it).
import { Calendar, createLucideIcon } from 'lucide-react'
import { periodLabel, type PickerValue } from '../../components/DatePicker'
import type { ISODate } from '../../lib/dates'
import { copy } from './copy'
import { toggleRowCollapsed, useRowCollapsed } from './rowCollapsed'

// Two arrows on the 24 grid, in the icons' stroke: in to fold, out to unfold.
const [Fold, Unfold] = [
  ['fold', 'M7 9l3 3-3 3M17 9l-3 3 3 3'],
  ['unfold', 'M6 9l-3 3 3 3M18 9l3 3-3 3'],
].map(([name, heads]) => createLucideIcon(name, [['path', { d: 'M3 12h7M21 12h-7' + heads }]]))

export function FoldToggle({ value, today, filters }: { value: PickerValue; today: ISODate; filters: number }) {
  const collapsed = useRowCollapsed()
  const label = periodLabel(value, today)
  const Icon = collapsed ? Unfold : Fold
  const action = collapsed ? copy.expand : copy.collapse
  return (
    <button type="button" className="btn ghost fold-toggle" aria-expanded={!collapsed} aria-label={collapsed ? `${label}, ${action}` : undefined} title={action} onClick={toggleRowCollapsed}>
      {collapsed && (
        <>
          <Calendar size={15} strokeWidth={1.75} className="range-icon" />
          <b className="range-label">{label}</b>
          {filters > 0 && <span className="filter-count num">{filters}</span>}
        </>
      )}
      <Icon size={16} strokeWidth={1.75} className="fold-icon" />
    </button>
  )
}
