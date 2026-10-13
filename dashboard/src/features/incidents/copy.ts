// The words of the incident history: the chart's markers, the page and its list, and the All sites uptime view.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('incidents', {
  // The chart's marker and its line.
  marker: (n: number, when: string) => (n === 1 ? `Incident on ${when}` : `${n} incidents on ${when}`),
  down: 'Down',
  quiet: 'Quiet',
  notReachable: 'not reachable',
  noVisits: 'no visits',
  line: (kind: string, span: string, why: string) => `${kind} ${span} · ${why}`,
  lineOpen: (kind: string, span: string, why: string) => `${kind} for ${span} so far · ${why}`,
  moreOnDay: (n: number) => `and ${n} more`,
  openPage: 'Open the incident history',

  // The status panel's link, the menu item, the page.
  history: 'Incident history',
  menu: 'Uptime & incidents',
  title: 'Uptime & incidents',
  back: 'Back to the dashboard',
  loading: 'Reading the incidents…',
  failed: 'Could not read the incidents. Try again.',
  none: 'No incidents in this period.',

  // The summary cards.
  cardIncidents: 'Incidents',
  cardAffected: 'Down or quiet for',
  cardUptime: 'Uptime',
  cardLost: 'Visits lost',
  lost: (n: string) => `≈ ${n} visits`,
  lostNone: '–',
  lostNote: 'Estimated from the same hours of the four weeks before.',
  uptimeNote: 'The share of the period without a down or quiet spell.',

  // The timeline.
  strip: 'Each day of the period',
  year: 'Each day of the year',
  dayOk: (day: string) => `${day}: no incident`,
  dayQuiet: (day: string) => `${day}: quiet`,
  dayDown: (day: string) => `${day}: down`,
  legendOk: 'No incident',
  legendQuiet: 'Quiet',
  legendDown: 'Down',

  // The list.
  list: 'All incidents',
  row: (kind: string, span: string) => `${kind} · ${span}`,
  rowOpen: (kind: string, span: string) => `${kind} · ${span} so far`,
  from: (a: string, b: string) => `${a} to ${b}`,
  ongoing: (a: string) => `${a}, still going`,
  seen: 'What our checks saw',
  seenQuiet: 'No visits came in, and the page answered when we looked.',
  expected: (n: string) => `≈ ${n} visits lost`,
  addNote: 'Add a note',
  editNote: 'Edit note',
  notePlaceholder: 'Why? For example: hosting migration',
  noteLabel: 'Note on this incident',
  save: 'Save',
  cancel: 'Cancel',
  noteFailed: 'The note was not saved. Try again.',
  more: 'Show older incidents',

  // All sites.
  lensUptime: 'Uptime',
  allSummary: (sites: string, pct: string, n: number) => `${sites} · ${pct}% uptime · ${n} incident${n === 1 ? '' : 's'}`,
  allEmpty: 'No incidents in this period.',
  allRow: (pct: string, n: number, span: string) => (n === 0 ? `${pct}% · no incidents` : `${pct}% · ${n} incident${n === 1 ? '' : 's'} · ${span}`),
  allOpen: (name: string) => `${name}: open the incident history`,
})
