// Every word the first run shows, in one place: this is what moves to the
// message files when translations come.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('onboarding', {
  label: 'Set up your first site',
  skip: 'Skip for now',
  skipHint: 'Esc',
  enterKey: '↵',
  steps: { label: 'Progress', site: 'Your site', code: 'Add the code', visit: 'First visit' },

  site: {
    title: 'Which site first?',
    sub: 'Type its address. You can add more sites later.',
    domain: 'Domain',
    prefix: 'https://',
    placeholder: 'yoursite.com',
    go: 'Continue',
    busy: 'Adding…',
    enter: 'or press Enter ↵',
  },
  preview: {
    label: (domain: string) => `A preview of the dashboard for ${domain}`,
    empty: 'yoursite.com',
    sample: 'Sample',
    visitors: 'Visitors',
    pageviews: 'Pageviews',
    online: 'Online now',
    none: '—',
    waiting: 'Your dashboard, ready and waiting',
  },
  install: {
    title: 'Add the code',
    sub: (domain: string) => `Paste it into the <head> of ${domain}, then open your site once.`,
    waiting: 'Waiting for your first visit…',
    check: 'Check now',
  },
  here: {
    title: 'Your first visitor just arrived',
    sub: 'Your site is live and counting.',
    page: 'Page',
    source: 'Source',
    direct: 'Direct',
    country: 'Country',
    time: 'Time',
    now: 'Just now',
    go: 'Open my dashboard',
    arrived: (path: string) => `Your first visit arrived: ${path}`,
  },
  more: {
    open: '+ Add another site',
    label: 'Another site',
    add: 'Add site',
    busy: 'Adding…',
    cancel: 'Cancel',
    placeholder: 'othersite.com',
    sites: 'Your sites',
    waiting: 'waiting',
    receiving: 'receiving',
  },
  skipDash: 'Skip for now — open my dashboard',
})
