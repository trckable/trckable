// The words of the live extras: the count in the tab, the sale toast, the
// browser notices and the card that asks for them. This is what moves to the
// message files.
import { defineCopy } from '../../i18n'

export const signals = defineCopy('signals', {
  sale: (amount: string) => `Cha-ching! ${amount}`,
  // Settings.
  on: 'On',
  off: 'Off',
  tab: { label: 'Live count in the tab', hint: 'A ● and how many are online, in the title of this browser tab' },
  sound: { label: 'Sale sound', hint: 'A short chime when a payment arrives' },
  notify: { label: 'Browser notices', hint: 'A first sale from a new source, a surge, a spike, or tracking stopping, while a trckable tab is open' },
  blocked: 'Notices are blocked for this site: allow them in your browser’s site settings',
  // The notices themselves.
  firstSource: (source: string) => `First sale from ${source}`,
  firstSourceBody: (domain: string) => `${domain} has a new paying source`,
  spike: (n: number) => `${n} online: about three times usual`,
  spikeBody: (domain: string) => `${domain} is busier than it has been in this tab`,
  stopped: (domain: string) => `Tracking stopped on ${domain}`,
  stoppedBody: (hours: number) => `Nothing has arrived for ${hours} hours`,
  // The surge card and its notice: a friend who noticed, with only counted numbers.
  surge: {
    label: 'Busy',
    title: 'Whoa, something’s happening',
    now: (online: number, times: string) => `${online} ${online === 1 ? 'person' : 'people'} on your site right now${times ? `, about ${times} usual` : ''}.`,
    from: (n: number, source: string, usual: string) => `${n} of them came from ${source}${usual ? ` (${usual})` : ''}.`,
    usually: (n: number) => (n >= 1 ? `usually about ${n}` : 'usually next to none'),
    direct: (n: number, usual: string) => `${n} of them came straight to the site${usual ? ` (${usual})` : ''}.`,
    page: (page: string) => `Most of them are reading ${page}.`,
    campaign: (name: string) => `The campaign is ${name}.`,
    country: (name: string) => `Mostly from ${name}.`,
    jump: (before: number, online: number, minutes: number) => `From ${before} to ${online} in ${minutes} minutes.`,
    // The story: only what was counted, and "looks like" for what only a person could know.
    more: 'More',
    less: 'Less',
    startedFrom: (source: string, at: string, page: string, exact: boolean) =>
      `Looks like a link on ${source}${page ? `, landing on ${page},` : ''} started sending people around ${at}${exact ? ' (the exact post isn’t visible)' : ''}.`,
    started: (at: string) => `It started climbing around ${at}.`,
    longer: 'It has been busy for more than an hour.',
    peak: (n: number, at: string, now: number) => `Peaked at ${n} at ${at}, ${now} now.`,
    phones: (pct: number) => `${pct}% on phones.`,
    desktops: (pct: number) => `${pct}% on computers.`,
    countries: (list: string) => `Top countries: ${list}.`,
    see: 'See it',
    notify: 'Get notified next time',
    close: 'Close',
    // The browser notice: at most one emoji.
    noticeTitle: (online: number, source: string) => `${online} people on your site right now${source ? `, mostly from ${source}` : ''} 🎉`,
    noticeBody: (domain: string) => `${domain} is busier than usual. Worth a look while it is happening.`,
  },
  // The side card.
  card: {
    label: 'Notices',
    title: 'Get notified?',
    body: 'A notice for a first sale from a new source, a spike or tracking stopping. Only while a trckable tab is open.',
    yes: 'Turn on',
    close: 'Close',
  },
})
