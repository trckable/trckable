// The words of the uptime check's settings: the pause, and the pages looked at with the homepage.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('uptimeCheck', {
  label: 'Uptime check',
  hint: 'We look at your site every few minutes and tell you when it stops answering',
  pausedHint: 'Paused. Nothing is looked at, so nothing is reported until you turn it back on',
  pages: 'More pages to check',
  pagesHint: (max: number) => `Pages on your own domain, up to ${max}. The site counts as down when any of them fails`,
  pathLabel: 'Page to check',
  pathPlaceholder: '/pricing',
  add: 'Add',
  remove: (path: string) => `Stop checking ${path}`,
  full: (max: number) => `Up to ${max} pages. Stop checking one to add another`,
  pathError: 'Use a page of your own site, like /pricing',
})
