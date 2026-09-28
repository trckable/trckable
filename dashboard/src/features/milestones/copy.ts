// The words of milestones: the moment, the timeline and the share sheet.
// The dashboard's text moves to message files when translations come, and
// this is what moves.
export const copy = {
  // What each family's number is.
  label: {
    visitors: 'visitors',
    pageviews: 'pageviews',
    firstPageview: 'First pageview',
    record_day: 'visitors · record day',
    countries: 'countries',
    first_goal: 'First goal',
    first_sale: 'First sale',
    revenue: 'revenue',
  },
  first: '1st',
  title: 'Milestones',
  menu: 'Milestones',
  share: 'Share',
  replay: 'Replay',
  close: 'Close',
  dismiss: 'Dismiss',
  next: (step: string, label: string, now: string) => `next ${step} ${label} · ${now} now`,
  none: 'Nothing yet. The first one is 100 visitors.',
  off: 'Milestones are off for this site.',
  // The share sheet.
  sheet: 'Share milestone',
  copyLink: 'Copy link',
  copied: 'Link copied',
  linkOnce: 'The link is shown once. Revoke it to make a new one.',
  shared: 'Link active',
  revoke: 'Revoke link',
  revoked: 'Link revoked',
  download: 'Download PNG',
  copyImage: 'Copy image',
  imageCopied: 'Image copied',
  email: 'Email to…',
  showAmount: 'Show amount',
  light: 'Light card',
  dark: 'Dark card',
  card: 'Card preview',
  mailSubject: (line: string) => line,
  // Settings.
  setting: 'Milestones',
  settingHint: 'A quiet note when the site reaches a round number',
}
