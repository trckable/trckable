// The few words Live's way in says: the switch and the Online now tile. They
// load with the dashboard, so they live apart from the view's own (copy.ts).
import { defineCopy } from '../../i18n'

export const entryCopy = defineCopy('live.entry', {
  switchLabel: 'View',
  live: 'Live',
  liveOnline: (n: number) => (n === 1 ? 'Live, 1 online now' : `Live, ${n.toLocaleString()} online now`),
  data: 'Data',
  switchTitle: (key: string) => `Live shows the site right now; Data shows the period (${key})`,
  onlineNow: 'Online now',
  onlineNote: 'visitors in the last 5 min',
  connecting: 'connecting…',
  openLive: 'Open Live',
})
