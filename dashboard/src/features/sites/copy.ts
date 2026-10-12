// The switcher's words on the first screen: its button and the state dots
// (menuCopy.ts has the list's). The dashboard's text moves to message files
// when translations come, and this is what moves.
import { defineCopy } from '../../i18n'


export const copy = defineCopy('sites', {
  pick: 'Pick a site',
  all: 'All sites',
  dot: {
    now: 'Visitors right now: a visit in the last 5 minutes',
    live: 'Receiving visits',
    quiet: 'No visits for hours',
    stopped: 'Down: the site did not answer when trckable last looked',
    new: 'Not installed yet',
  },
})
