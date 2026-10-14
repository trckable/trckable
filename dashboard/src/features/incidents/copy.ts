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

  // The summary cards.
  clean: (period: string) => `No incidents · ${period}`,
  cleanUp: '100% up',
  downOnly: 'down checks only',
  downOnlyNote: 'Down checks only: this site has too few visits for quiet spells to be tracked.',
  watchedSince: (day: string) => `watched since ${day}`,
  checkedFor: (span: string, down: string) => (down ? `Checked for ${span}, down for ${down}` : `Checked for ${span}, no downtime`),
  tooEarly: 'Too early',
  notWatched: 'Not watched yet',
  notWatchedNote: (day: string) => `Incidents are recorded from ${day} on.`,
  cardIncidents: 'Incidents',
  cardAffected: 'Down or quiet for',
  cardUptime: 'Uptime',
  cardLost: 'Visits lost',
  lost: (n: string) => `≈ ${n} visits`,
  lostNote: 'Added up over the incidents that have an estimate, each from the same hours of up to four earlier weeks without an incident.',
  uptimeNote: 'The share of the period without a down or quiet spell.',

  // The timeline.
  strip: 'Each day of the period',
  year: 'Each day of the year',
  dayOk: (day: string) => `${day}: no incident`,
  dayQuiet: (day: string, span: string) => `${day}: quiet · ${span}`,
  dayUnwatched: (day: string) => `${day}: not watched yet`,
  dayDown: (day: string, span: string) => `${day}: down · ${span}`,
  legendOk: 'No incident',
  legendQuiet: 'Quiet',
  legendDown: 'Down',
  legendUnwatched: 'Not watched yet',

  // The list.
  list: 'All incidents',
  row: (kind: string, span: string) => `${kind} · ${span}`,
  rowOpen: (kind: string, span: string) => `${kind} · ${span} so far`,
  from: (a: string, b: string) => `${a} to ${b}`,
  ongoing: (a: string) => `${a}, still going`,
  seen: 'What our checks saw',
  seenQuiet: 'No visits came in.',
  seenAnswered: 'The page answered when we looked.',
  expected: (n: string) => `≈ ${n} visits lost`,
  addNote: 'Add a note',
  editNote: 'Edit note',
  notePlaceholder: 'Why? For example: Server move',
  noteLabel: 'Note on this incident',
  save: 'Save',
  cancel: 'Cancel',
  noteFailed: 'The note was not saved. Try again.',
  more: 'Show older incidents',
  quietNote: 'Quiet periods are tracked once a site gets about 24 visits a day. Down periods always are.',
  noVisitsAll: 'No visits all period',

  // All sites.
  lensUptime: 'Uptime',
  allSummary: (sites: string, pct: string, n: number) => `${sites} · ${pct}% uptime · ${n} incident${n === 1 ? '' : 's'}`,
  allEmpty: 'No incidents in this period.',
  allRow: (pct: string, n: number, span: string) => (n === 0 ? `${pct}% · no incidents` : `${pct}% · ${n} incident${n === 1 ? '' : 's'} · ${span}`),
  allOpen: (name: string) => `${name}: open the incident history`,
})
