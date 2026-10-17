// The search box's words.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('palette', {
  placeholder: 'Jump to a table, a site, a filter...',
  none: (q: string) => `No match for “${q}”. Try “pages”, “Germany” or “last 7 days”.`,
  ask: 'Ask Peek…',
  goLive: 'Go to Live',
  goBriefing: 'Go to Briefing',
  clear: 'Clear all filters',
  switchTo: (n: string) => `Switch to ${n}`,
  period: 'Period',
  filter: 'Filter',
  create: 'Create',
  newGoal: 'Create · A goal',
  newFunnel: 'Create · A funnel',
  newNote: 'Create · A note on the chart',
  source: 'source',
  country: 'country',
  groups: { create: 'Create', ask: 'Ask', goTo: 'Go to', sites: 'Sites', period: 'Period', filters: 'Filters' },
  kinds: { create: 'new', peek: 'peek', table: 'table', view: 'view', filter: 'filter', site: 'site', period: 'period' },
})
