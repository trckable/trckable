// The table the panel is on: one of the dimension tables, or one of the sections with a body of its own.
import type { Filter, Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { Overview } from './bodies/Overview'
import { Funnels } from './bodies/Funnels'
import { Bots, Outbound } from './bodies/Links'
import { Mentions } from './bodies/Mentions'
import { Sales } from './bodies/Sales'
import { Search } from './bodies/Search'
import { Speed } from './bodies/Speed'
import { DimTable, TABLES } from './bodies/Tables'
import type { Tab } from './sections'
import type { Answer } from './useData'

export interface BodyProps {
  tab: Tab
  site: Site
  range: Range
  answer: Answer | null
  filters: Filter[]
  comparing: boolean
  limit: number
  day: string | null
  money?: (minor: number) => string
  label: string
  onPick: (dim: string, value: string) => void
  onAll: () => void
  onClear: () => void
  goTo: (t: Tab) => void
  onGoal: () => void
}

export function Body(p: BodyProps) {
  const a = p.answer
  if (!a) return null
  if (p.tab === 'overview') return <Overview site={p.site} range={p.range} a={a} filters={p.filters} comparing={p.comparing} day={p.day} onPick={p.onPick} goTo={p.goTo} label={p.label} />
  if (TABLES[p.tab]) return <DimTable tab={p.tab} site={p.site} range={p.range} a={a} filters={p.filters} comparing={p.comparing} limit={p.limit} onPick={p.onPick} onAll={p.onAll} onClear={p.onClear} onDetails={() => undefined} day={p.day} />
  if (p.tab === 'search') return <Search site={p.site} range={p.range} limit={p.limit} onAll={p.onAll} onGoal={p.onGoal} />
  if (p.tab === 'sales') return <Sales site={p.site} range={p.range} money={p.money} limit={p.limit} onAll={p.onAll} onGoal={p.onGoal} />
  if (p.tab === 'funnels') return <Funnels site={p.site} range={p.range} a={a} onGoal={p.onGoal} />
  if (p.tab === 'speed') return <Speed site={p.site} range={p.range} limit={p.limit} onAll={p.onAll} />
  if (p.tab === 'mentions') return <Mentions site={p.site} limit={p.limit} onAll={p.onAll} />
  if (p.tab === 'outbound') return <Outbound site={p.site} range={p.range} limit={p.limit} onAll={p.onAll} />
  if (p.tab === 'bots') return <Bots site={p.site} range={p.range} />
  return null
}
