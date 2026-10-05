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
  // The surge card, its story and its notice: a friend who noticed, with only counted numbers.
  surge: {
    label: 'Busy',
    title: 'Whoa, something’s happening',
    onlineNow: 'online now',
    chip: (times: string) => `${times} usual`,
    mostly: (source: string) => `Mostly from ${source}`,
    some: (n: number, source: string) => `${n} from ${source}`,
    mostlyDirect: 'Mostly direct visits',
    someDirect: (n: number) => `${n} direct`,
    more: 'More',
    seeData: 'See it in Data',
    notify: 'Get notified next time',
    close: 'Close',
    // The story.
    modalLabel: 'The busy moment',
    jump: (before: number, online: number, minutes: number) => `${before} → ${online} in ${minutes} min`,
    chartLabel: (start: string, peak: number) => `People online in the last hour${start ? `, climbing from ${start}` : ''}, peaking at ${peak}`,
    hourAgo: '1 h ago',
    nowEdge: 'now',
    startMark: (at: string) => `Start ${at}`,
    peakMark: (n: number) => `Peak ${n}`,
    beatStart: (at: string, source: string) => `${at} started${source ? ` · ${source}` : ''}`,
    beatPeak: (at: string, n: number) => `${at} peak ${n}`,
    beatNow: (n: number) => `now ${n}`,
    beatLonger: 'Busy for more than an hour',
    tileSources: 'Sources',
    tilePage: 'Landing page',
    tileCountries: 'Countries',
    tileDevices: 'Devices',
    phone: 'Phone',
    computer: 'Computer',
    usually: (n: number) => (n >= 1 ? `usually about ${n}` : 'usually next to none'),
    campaign: (name: string) => `Campaign ${name}`,
    // What only a person could know is "looks like", and the exact post is never claimed.
    startedFrom: (source: string, page: string) => `Looks like a link on ${source}${page ? `, landing on ${page},` : ''} started sending people. The exact post isn’t visible.`,
    startedNoSource: 'The climb began without a referring site we can see.',
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
    latest: 'Your latest sale',
  },
})
