// What Data adds over its numbers: the switch between the story and Explore,
// the story itself, and over Explore the chip that leads back to it. One lazy
// chunk, so the first load carries none of it (Dashboard).
import type { Report, ReportQuery, Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { setView } from '../../lib/url'
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
  money?: (minor: number) => string
  narrow: boolean
  onGoal: () => void
}

export default function StoryHost(p: StoryHostProps) {
  return (
    <>
      <ViewSwitch story={p.on} phone={p.narrow} onPick={(v) => setView({ v, story: undefined })} />
      {!p.on && p.from && (
        <FromStory from={p.from} onBack={() => setView({ v: 'story', story: undefined, filters: [], day: undefined, compare: 'none' })} />
      )}
      {p.on && <StoryView site={p.site} query={p.query} data={p.data} range={p.range} money={p.money} narrow={p.narrow} onGoal={p.onGoal} />}
    </>
  )
}
