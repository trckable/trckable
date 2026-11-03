// The Places section's words: the four numbers over the map, the map, and the tables under it.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('v2places', {
  tabs: 'Places',
  tileCountries: 'Countries',
  tileRegions: 'Regions',
  tileCities: 'Cities',
  tileTop: 'Top country',
  tileWith: 'with a visitor in this period',
  tileNotKept: 'Not recorded on this site',
  tileNone: 'None yet',
  topShare: (share: string) => `${share} of people`,
  mapLabel: 'Visitors by country',
  mapFoot: (n: string) => `${n} countries · tap one to filter`,
  mapVisitors: (n: string) => `${n} visitors`,
  credit: 'IP geolocation by DB-IP',
  noteZones: 'Time zones come from where the visit was placed, and only on sites that keep region and city.',
})
