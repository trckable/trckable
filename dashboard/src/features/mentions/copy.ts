// The words of Mentions: the card on the dashboard, its settings, Live's chip
// and the lines Replay tells. A mention's place is said three ways: its name
// ("Hacker News"), where it was posted ("on Hacker News") and what happened
// ("posted on Hacker News").
import { defineCopy } from '../../i18n'
import { count } from '../../i18n/helpers'

export const copy = defineCopy('mentions', {
  title: 'Mentions',
  period: 'Last 30 days',
  name: { hn: 'Hacker News', ph: 'Product Hunt', news: 'News & blogs' },
  posted: { hn: 'posted on Hacker News', ph: 'launched on Product Hunt', news: 'written about in the news' },
  postedHead: { hn: 'Posted on Hacker News', ph: 'Launched on Product Hunt', news: 'Written about in the news' },
  lookingOn: (places: string) => `trckable looks on ${places} every 20 minutes.`,
  empty: 'No mentions yet. When someone writes about your site, it shows up here with the visitors it brought.',
  searched: 'It searches for',
  change: 'Change the words',
  brought: (n: number) => `${count(n, 'visitor', 'visitors')} came from it`,
  noneYet: 'No visitors counted yet',
  visitorsLabel: 'visitors',
  comment: 'Comment',
  front: 'Front page',
  by: (author: string) => `by ${author}`,
  points: { hn: (n: number) => `${n} points`, ph: (n: number) => `${n} upvotes` },
  open: (title: string) => `Open: ${title}`,
  more: (n: number) => `Show ${n} more`,
  less: 'Show fewer',
  // Replay: a jump a mention explains, and a mention of its own.
  jumped: (change: string, at: string, posted: string, n: number) => `Visits jumped ${change} at ${at}: ${posted}, ${count(n, 'visitor', 'visitors')} came from it.`,
  jumpedDay: (change: string, posted: string, n: number) => `Visits jumped ${change}: ${posted}, ${count(n, 'visitor', 'visitors')} came from it.`,
  postedLine: (head: string, n: number) => `${head}: ${count(n, 'visitor', 'visitors')} came from it`,
  // Live
  chip: (name: string) => `From ${name} now`,
  // Settings
  settings: {
    intro: (places: string) => `trckable looks for these words on ${places} every 20 minutes, and ties each mention to the visitors it brought. Your address and your site name are always searched.`,
    always: 'Always searched',
    yours: 'Your words',
    none: 'No words added',
    add: 'Add a word',
    label: 'Word to search for',
    hint: (n: number) => `A product name, a handle, anything people call your site. Up to ${n}.`,
    remove: (w: string) => `Remove ${w}`,
    save: 'Save words',
    saving: 'Saving…',
    saved: 'Words saved',
    full: (n: number) => `That is the most you can add: ${n}.`,
  },
  // Settings → Alerts
  alert: { label: 'Mention', hint: 'When a mention brings 20 or more visitors, or reaches the Hacker News front page: once per mention' },
})
