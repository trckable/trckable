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
  return <EmptyTab x={x} />
}

/** A table with no rows in the period: what is missing, why it may be, and the one thing to try. */
export function EmptyTab({ x }: { x: XCtx }) {
  return (
    <XEmpty title={copy.emptyTab(x.tabName)} hint={x.widen ? copy.emptyTabShort : copy.emptyTabLater}>
      {x.widen && (
        <button type="button" className="xb" onClick={x.widen}>
          {copy.widen}
        </button>
      )}
    </XEmpty>
  )
}
