// The left of the header's second row, only when there is something to show:
// the filters in force and the saved views. Its own chunk: most visits have
// neither, so none of it is in the first load.
import { ActiveFilters } from '../../components/ActiveFilters'
import { SavedViews } from '../../components/SavedViews'
import type { Filter, Segment } from '../../lib/api'
import { parseFilterParam, setsOf, type FilterSet } from '../../lib/filterSet'
import { channelColor } from '../../lib/palette'
import { setWords } from './setWords'

export interface FilterRowProps {
  filters: Filter[]
  dimLabel: (dim: string) => string
  valueLabel: (dim: string, value: string) => string
  onRemove: (set: FilterSet) => void
  onFlip: (set: FilterSet) => void
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

/** What a saved view narrows to, in the chips' words: "Channel is Direct · Campaign is launch_week". */
function describe(p: FilterRowProps, q: string) {
  const filters: Filter[] = new URLSearchParams(q).getAll('f').flatMap((f) => parseFilterParam(f) ?? [])
  return setsOf(filters)
    .map((set) => {
      const w = setWords(set, p.dimLabel, p.valueLabel)
      return `${w.dim} ${w.op} ${w.value}`
    })
    .join(' · ')
}

export default function FilterRow(p: FilterRowProps) {
  const on = p.filters.length > 0
  const shown = setsOf(p.filters).map((set) => ({
    key: set.dim + '\u0000' + set.op,
    ...setWords(set, p.dimLabel, p.valueLabel),
    dot: set.dim === 'channel' && set.values.length === 1 ? channelColor(set.values[0]) : undefined,
    raw: set,
  }))
  return (
    <>
      {!p.onlyViews && <ActiveFilters filters={shown} onRemove={p.onRemove} onFlip={p.onFlip} onClear={p.onClear} onSave={p.onSave} compound={p.filters.length > 1} />}
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
