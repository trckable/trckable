// The words of the bar for a site that is not answering.
import { defineCopy } from '../../i18n'

export const downCopy = defineCopy('sitestatus.down', {
  bar: (since: string, cause: string) =>
    `Your site isn’t answering our checks since ${since}${cause ? ` (${cause})` : ''}. Some visitors still get through, which is why you still see people online.`,
  see: 'See incident',
})
