// The words of the bar for a site that is not answering.
import { defineCopy } from '../../i18n'

export const downCopy = defineCopy('sitestatus.down', {
  bar: (cause: string) =>
    `Your site isn’t answering our checks${cause ? ` (${cause})` : ''}. Some visitors still get through, which is why you still see people online.`,
  see: 'See incident',
  blocked: 'We can’t check this site: its firewall blocks our checks. Your visitors aren’t affected.',
  blockedBadge: 'Can’t check',
  blockedLook: 'Blocked by the firewall',
})
