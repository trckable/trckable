// The page foot's words (Footer.tsx, ServerStatus.tsx, FeedbackDialog.tsx), in one place.
import { defineCopy } from '../i18n'

export const footerCopy = defineCopy('footer', {
  newer: (v: string) => `v${v} is out`,
  changelog: 'Changelog',
  docs: 'Docs',
  feedback: 'Feedback',
  shortcuts: 'Keyboard shortcuts',
  status: {
    ok: { label: 'trckable: all normal', tip: 'About our service, not your sites: this server answers, and the visits it counts are showing up as they happen.' },
    late: { label: 'trckable: delayed', tip: 'About our service, not your sites: the server is up, but the newest visits take longer than usual to show. They are kept safely and catch up on their own.' },
    down: { label: 'trckable: can’t reach the server', tip: 'About our service, not your sites: this page could not get an answer from the server just now. Check your connection, or the server itself if you run it. It looks again every minute.' },
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
