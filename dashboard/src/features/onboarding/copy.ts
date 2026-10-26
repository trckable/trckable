// Every word the first run shows, in one place: this is what moves to the
// message files when translations come.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('onboarding', {
  label: 'Set up your first site',
  skip: 'Skip for now',
  skipHint: 'Esc',
  enterKey: '↵',
  progress: (at: number, of: number, name: string) => `Step ${at} of ${of}: ${name}`,
  steps: { site: 'Your site', code: 'Add the code', visit: 'First visit' },

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
  preview: { empty: 'yoursite.com' },
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
    sites: 'Your sites',
    receiving: 'receiving',
  },
  empty: {
    title: 'No sites yet',
    sub: 'Add your first site to start counting visits.',
    add: 'Add your first site',
  },
})
