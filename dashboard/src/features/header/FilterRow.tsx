// The left of the header's second row, only when there is something to show:
// the filters in force and the saved views. Its own chunk: most visits have
// neither, so none of it is in the first load.
import { ActiveFilters } from '../../components/ActiveFilters'
import { SavedViews } from '../../components/SavedViews'
import type { Filter, Segment } from '../../lib/api'
import { channelColor } from '../../lib/palette'
import { rowCopy } from './rowCopy'

export interface FilterRowProps {
  filters: Filter[]
  dimLabel: (dim: string) => string
  valueLabel: (dim: string, value: string) => string
  onRemove: (f: Filter) => void
  onClear: () => void
  onSave: () => void
  /** A phone: the saved views alone, in ⋯ (the chips are in the sheet). */
  onlyViews?: boolean
  /** Absent on a shared link: it has no saved views. */
  views?: {
    list: Segment[]
    current: string
    onOpen: (v: Segment) => void
    onRename: (v: Segment, name: string) => Promise<unknown>
    onDelete: (v: Segment) => Promise<unknown>
  }
}

/** What a saved view narrows to, in words: "Channel Direct · Campaign launch_week". */
function describe(p: FilterRowProps, q: string) {
  return new URLSearchParams(q)
    .getAll('f')
    .map((f) => {
      const [dim = '', ...rest] = f.split(':')
      return `${p.dimLabel(dim)} ${p.valueLabel(dim, rest.join(':'))}`
    })
    .join(' · ')
}

export default function FilterRow(p: FilterRowProps) {
  const on = p.filters.length > 0
  const shown = p.filters.map((f) => ({
    key: f.dim + '\u0000' + f.value,
    dim: p.dimLabel(f.dim),
    value: p.valueLabel(f.dim, f.value),
    dot: f.dim === 'channel' ? channelColor(f.value) : undefined,
    raw: f,
  }))
  return (
    <>
      {!p.onlyViews && (
        <div className="toolbar-filters" role={on ? 'group' : undefined} aria-label={on ? rowCopy.active : undefined}>
          <ActiveFilters filters={shown} onRemove={p.onRemove} onClear={p.onClear} onSave={p.onSave} />
        </div>
      )}
      {p.views && (
          <SavedViews
            views={p.views.list}
            current={p.views.current}
            canSave={on}
            onOpen={p.views.onOpen}
            onSave={p.onSave}
            onRename={p.views.onRename}
            onDelete={p.views.onDelete}
            describe={(q) => describe(p, q)}
          />
      )}
    </>
  )
}
