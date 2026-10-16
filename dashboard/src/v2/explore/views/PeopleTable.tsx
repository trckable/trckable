// A table of people for a section, or what to say when there is none.
import { XEmpty } from '../../ui/XBits'
import { XTable, type XTableProps } from '../../ui/XTable'
import { copy } from '../copy'
import type { XCtx } from '../ctx'

export function PeopleTable({ x, ...p }: { x: XCtx } & XTableProps) {
  if (p.rows.length) return <XTable {...p} />
  if (x.filters.length)
    return (
      <XEmpty title={copy.emptyFiltered} hint={copy.emptyFilteredHint}>
        <button type="button" className="xb" onClick={x.clearFilters}>
          {copy.clearFilters}
        </button>
      </XEmpty>
    )
  return <XEmpty title={copy.emptyPeriod} hint={copy.emptyPeriodHint} />
}
