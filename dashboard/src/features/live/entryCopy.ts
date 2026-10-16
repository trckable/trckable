// The few words Live's way in says: the switch's. They
// load with the dashboard, so they live apart from the view's own (copy.ts).
import { defineCopy } from '../../i18n'

export const entryCopy = defineCopy('live.entry', {
  switchLabel: 'View',
  live: 'Live',
  liveOnline: (n: number) => (n === 1 ? 'Live, 1 online now' : `Live, ${n.toLocaleString()} online now`),
  briefing: 'Briefing',
  data: 'Data',
  switchTitle: (key: string) => `Live shows the site right now, the Briefing tells the day, Data shows the numbers (${key})`,
  onlineNow: 'Online now',
})
