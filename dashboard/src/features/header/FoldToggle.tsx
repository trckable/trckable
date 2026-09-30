// The control capsule's fold toggle, at its right end after Filter: » while
// the row is open (tuck it in), « once it is folded (bring it out). Folded, it
// carries a summary (the period and the filter count) that grows in as the
// row's width runs to zero (ControlRow.css).
import { Calendar, ChevronsRight } from 'lucide-react'
import { periodLabel, type PickerValue } from '../../components/DatePicker'
import type { ISODate } from '../../lib/dates'
import { copy } from './copy'
import { toggleRowCollapsed, useRowCollapsed } from './rowCollapsed'

export function FoldToggle({ value, today, filters }: { value: PickerValue; today: ISODate; filters: number }) {
  const collapsed = useRowCollapsed()
  const label = periodLabel(value, today)
  const action = collapsed ? copy.expand : copy.collapse
  return (
    <button type="button" className="btn ghost fold-toggle" aria-expanded={!collapsed} aria-label={collapsed ? `${label}, ${action}` : undefined} title={action} onClick={toggleRowCollapsed}>
      <span className="fold-sum-w" aria-hidden="true">
        <span className="fold-sum">
          <Calendar size={15} strokeWidth={1.75} className="range-icon" />
          <b className="sum-label">{label}</b>
          {filters > 0 && <span className="filter-count num sum-count">{filters}</span>}
        </span>
      </span>
      <ChevronsRight size={16} strokeWidth={1.75} className="fold-icon" aria-hidden="true" />
    </button>
  )
}
