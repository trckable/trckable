// What Data adds over its numbers: the switch between the story and Explore,
// the story itself, and over Explore the bar that leads back to it. One lazy
// chunk, so the first load carries none of it (Dashboard).
import type { Filter, Report, ReportQuery, Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { setView } from '../../lib/url'
import { DIM_LABEL } from '../overview/dimLabels'
import FromStory from './FromStory'
import StoryView from './StoryView'
import { ViewSwitch } from './ViewSwitch'
import './StoryView.css'


export interface StoryHostProps {
  /** The story is the view on show. */
  on: boolean
  from?: string
  site: Site
  query: ReportQuery
  data: Report
  range: Range
  filters: Filter[]
  filterLabel: (dim: string, value: string) => string
  money?: (minor: number) => string
  narrow: boolean
  onGoal: () => void
  onClear: () => void
}

export default function StoryHost(p: StoryHostProps) {
  const filters = p.filters.map((f) => ({ key: f.dim + f.value, dim: DIM_LABEL[f.dim] ?? f.dim, value: p.filterLabel(f.dim, f.value) }))
  return (
    <>
      <ViewSwitch story={p.on} onPick={(v) => setView({ v, story: undefined })} />
      {!p.on && p.from && (
        <FromStory from={p.from} range={[p.range.from, p.range.to]} filters={filters} onBack={() => setView({ v: 'story', story: undefined, filters: [], day: undefined, compare: 'none' })} onClear={filters.length > 0 ? p.onClear : undefined} />
      )}
      {p.on && <StoryView site={p.site} query={p.query} data={p.data} range={p.range} money={p.money} narrow={p.narrow} onGoal={p.onGoal} />}
    </>
  )
}
