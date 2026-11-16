// The words of changing a site's domain (Settings → General).
import { defineCopy } from '../../i18n'

export const copy = defineCopy('domainChange', {
  label: 'Domain',
  hint: 'The address this site runs on',
  change: 'Change',
  also: (old: string, date: string) => `Also accepting ${old} until ${date}`,
  stopNow: 'Stop now',
  stopped: (old: string) => `No longer accepting ${old}`,
  noMatch: (property: string, domain: string) => `Search Console is connected to ${property}, which is not ${domain}. Connect ${domain} under Search Console to keep search terms coming.`,
  // The dialog.
  title: 'Change domain',
  newLabel: 'New domain',
  newHint: 'Like example.com. The site, its snippet and its history stay.',
  next: 'Continue',
  cancel: 'Cancel',
  back: 'Back',
  confirmTitle: (from: string, to: string) => `Change ${from} to ${to}?`,
  confirmHint: 'This is what changes.',
  keep: 'The site keeps its id, its tracker snippet and all its history. Nothing is counted twice.',
  accepting: (old: string, date: string) => `Visits from ${old} still count until ${date}. After that they are refused.`,
  follows: (to: string) => `The uptime check, the status page and share links use ${to}.`,
  nameFollows: (to: string) => `The site's name becomes ${to}.`,
  note: (to: string) => `A note on the chart says: Domain changed to ${to}.`,
  searchWarn: (to: string) => `Search Console is not connected to ${to}. Connect it afterwards to keep search terms coming.`,
  confirm: 'Change domain',
  done: (to: string) => `Domain changed to ${to}`,
  checking: 'Checking…',
  tooSoon: 'A site’s domain can change once a day. Try again tomorrow.',
})

// Allowed domains (Settings → General, under Domain).
export const allowedCopy = defineCopy('allowedDomains', {
  label: 'Allowed domains',
  hint: 'Visits from these addresses count too, e.g. staging or an old domain',
  placeholder: 'staging.example.com',
  add: 'Add',
  remove: (host: string) => `Remove ${host}`,
  allow: (host: string) => `Allow ${host}`,
  refused: 'Refused this week',
  added: (host: string) => `${host} is allowed now`,
  removed: (host: string) => `${host} is no longer allowed`,
  have: 'That address is already listed',
  bad: 'Use an address like staging.example.com: no https://, path, port, spaces or IP number',
  shared: 'That address is shared by many sites. Use your own, like staging.example.com',
  full: (n: number) => `You can allow up to ${n} addresses. Remove one first.`,
})
