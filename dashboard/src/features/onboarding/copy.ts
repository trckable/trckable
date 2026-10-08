// Every word the first run shows, in one place: this is what moves to the
// message files when translations come.
import { fmtInt } from '../../lib/format'
import { defineCopy } from '../../i18n'

export const copy = defineCopy('onboarding', {
  label: 'Set up your first site',
  skip: 'Skip for now',
  skipHint: 'Esc',
  account: 'Account',
  docs: 'Docs',
  profile: 'Profile',
  signOut: 'Sign out',
  enterKey: '↵',
  progress: (at: number, of: number) => `Step ${at} of ${of}`,

  site: {
    title: 'Which site first?',
    sub: 'Type its address. You can add more sites later.',
    domain: 'Domain',
    placeholder: 'yoursite.com',
    go: 'Continue',
    busy: 'Adding…',
    enter: 'or press Enter ↵',
  },
  preview: {
    label: (domain: string) => `A preview of the dashboard for ${domain}`,
    empty: 'yoursite.com',
    sample: 'Sample',
    live: 'Live',
    visitors: 'Visitors',
    pageviews: 'Pageviews',
    online: 'Online now',
    none: '—',
    waiting: 'Your dashboard, ready and waiting',
    opened: (where: string, path: string) => (where ? `${where} · opened ${path}` : `Opened ${path}`),
  },
  install: {
    title: 'One line in your site’s head',
    sub: (domain: string) => `Paste it, open ${domain} once, and this moves on by itself.`,
  },
  here: {
    title: 'Someone’s here.',
    sub: (domain: string) => `Your first visit just landed on ${domain}. Every page they open shows up as it happens.`,
    go: 'Continue',
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
  count: (n: number) => fmtInt(n),
})
