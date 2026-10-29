// The words of a site's way to its first visit: one headline, at most one line, one action, and a small "Why?".
import { defineCopy } from '../../i18n'

export const journey = defineCopy('install.journey', {
  waiting: { head: 'Waiting for the first visit', line: 'Add the code, then open your site once.' },
  limited: { head: 'Waiting for the first visit', line: 'Checked a lot just now. Looking again soon.' },
  notfound: { head: 'Script not found', line: 'Add the code to your page’s <head>, then publish.' },
  wrongid: { head: 'Not this site’s script', line: 'The script on the page has another id. Copy the code again.' },
  elsewhere: { head: 'Visits from another domain', line: (host: string, more: number) => `Visits are arriving from ${host}${more > 0 ? ` and ${more} more` : ''}: add it, or fix the script.` },
  unreachable: { head: 'Can’t reach your site', line: 'Is the site online?' },
  blocked: { head: 'The script does not load', line: (status: number) => (status ? `It answered ${status}.` : 'It could not be loaded.') },
  found: { head: 'Script found', line: 'Open your site once: the first visit shows here.' },
  arrived: { head: 'First visit received', line: 'Opening Live…' },
  stale: { head: 'Still waiting', line: (days: number) => `No visit in ${days} days.` },
  now: 'Check now',
  again: 'Check again',
  open: 'Open your site',
  last: (time: string) => `last check ${time}`,
  why: 'Why?',
  help: 'Need help?',
  docs: 'Docs',
  support: 'Support',
  remove: 'Remove this site',
  showCode: 'Show the code',
  whyMissing: ['The code is not in the page’s <head> yet.', 'A cache or CDN still serves the old page: purge it.', 'It is only on a staging copy, not on the live site.', 'data-domain is not this site’s domain.'],
  whyOffline: ['The domain is mistyped, or its DNS does not point to your server yet.', 'The server is down or answers too slowly.', 'A firewall or bot protection blocks our check: your visitors still count.'],
  whyQuiet: ['An ad blocker or a private window can hide your own visit: try another browser.', 'Do Not Track is on: trckable respects it.', 'A cache or CDN serves an old copy of the page.'],
})
