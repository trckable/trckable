// The words of a site that stopped: its card on the dashboard and its label in
// the switcher's list (menuCopy.ts has the label itself).
import { defineCopy } from '../../i18n'

export const copy = defineCopy('sitestatus', {
  label: 'Site status',
  chipDown: 'Down',
  chipQuiet: 'Tracking stopped',
  downSince: (when: string) => `Your site is down since ${when}`,
  sinceVisit: (when: string) => `No visits since ${when}`,
  causeDown: 'The site did not answer when trckable looked. Everything recorded before is kept.',
  causeFine: 'The page, the tag and the script all look right. There have simply been no visits.',
  causeWait: 'Looking at the page from outside to find out why. Everything recorded before is kept.',
  chartLabel: (when: string) => `Visits over the last 24 hours. The last one was at ${when}.`,
  stopMark: (when: string) => `Last visit ${when}`,
  dayAgo: '24 h ago',
  nowEdge: 'now',
  back: (when: string, gap: string) => `Back since ${when} · gap of ${gap}`,

  tileVisit: 'Last visit',
  tileHome: 'Homepage',
  tileChecks: 'What we checked',
  noPage: 'No page recorded',
  answered: (status: number, ms: number) => `${status} · ${ms} ms`,
  checking: 'Checking…',
  tryLater: 'Checked many times just now. Try again in a few minutes.',
  failed: 'The checks did not run. Try again.',
  page: 'Page answers',
  pageOk: (status: number, ms: number) => `Answered ${status} in ${ms} ms.`,
  tag: 'Script tag found',
  script: 'Script loads',
  scriptOk: (status: number) => `The script answered ${status}.`,
  scriptBad: (url: string, status: number) => (status ? `${url} answered ${status}. Visitors’ browsers get nothing from it.` : `${url} could not be loaded.`),

  mute: 'Mute alerts for 24 h',
  muted: (when: string) => `Muted until ${when}`,
  undo: 'Undo',
  again: 'Check again',
  open: 'Open site',
  guide: 'Install guide',
})
