// Every word of the source markers on the charts, of the line under the
// headline and of the menu that turns markers on and off. A source's own name
// is not here: it is a proper noun (sources.ts).
import { fmtInt } from '../../lib/format'
import { defineCopy } from '../../i18n'

export const copy = defineCopy('markers', {
  group: 'Sources and links on the chart',
  chip: (name: string, added: number) => `${name} +${fmtInt(added)}`,
  mark: (name: string, added: number, day: string, more: number) => `${name}, ${fmtInt(added)} more visitors on ${day}${more ? `, and ${more} more` : ''}. Open`,
  sent: (name: string, visitors: number, day: string) => `${name} sent ${fmtInt(visitors)} ${visitors === 1 ? 'visitor' : 'visitors'} on ${day}`,
  alsoNear: (n: number) => `and ${n} more around then`,
  see: 'See these visitors',
  close: 'Close',
  line: (day: string, name: string, added: number) => `Most of the ${day} jump came from ${name} (+${fmtInt(added)})`,
  menu: 'Markers',
  menuLabel: 'Markers on the charts',
  layers: { sources: 'Sources', links: 'Links', goals: 'Goals', moments: 'Moments' },
})
