// The words of the foot's two lazy parts (ServerStatus.tsx, FeedbackDialog.tsx), apart from footerCopy.ts so the first load does not carry them.
import { defineCopy } from '../i18n'

export const footerMoreCopy = defineCopy('footerMore', {
  feedback: 'Feedback',
  siteDown: (names: string[], why?: string) => (names.length === 1 ? `${names[0]} is down${why ? `: ${why}` : ''}` : `${names.length} sites are down`),
  siteDownTip: 'The server cannot open this site just now. Everything recorded before is kept, and trckable looks again on its own.',
  siteQuiet: (n: number) => `${n} quiet`,
  siteQuietTip: 'No visits for hours on this site. The server still reaches it, so this is about traffic, not an outage.',
  status: {
    ok: { label: 'All systems normal', tip: 'This server answers, your sites answer our checks, and the visits it counts are showing up as they happen.' },
    late: { label: 'Visits are delayed', tip: 'About our service, not your sites: the server is up, but the newest visits take longer than usual to show. They are kept safely and catch up on their own.' },
    down: { label: 'Can’t reach the server', tip: 'About our service, not your sites: this page could not get an answer from the server just now. Check your connection, or the server itself if you run it. It looks again every minute.' },
  },
  dialog: {
    hint: 'What would make trckable better? A bug, a wish, a kind word.',
    field: 'Your feedback',
    cancel: 'Cancel',
    send: 'Send',
    sending: 'Sending…',
    thanks: 'Thank you, that was sent',
  },
})
