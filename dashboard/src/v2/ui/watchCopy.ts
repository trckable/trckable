// The Watching card's words.
import { defineCopy } from '../../i18n'

export const copyOf = defineCopy('watchcard', {
  watching: 'Watching',
  pinned: "pinned to the top of tomorrow's Briefing",
  back: 'back to normal',
  since: (at: string) => `Since you started watching (${at}):`,
  stop: 'Stop',
})
