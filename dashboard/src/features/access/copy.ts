// Every word site access shows, in one place: the dashboard's text moves to
// message files when translations come, and this is what moves.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('access', {
  all: 'All sites',
  none: 'No sites',
  /** The person's ⋯ menu item, and the popup's title. */
  menuItem: 'Allowed sites',
  editFor: (email: string) => `Allowed sites for ${email}`,
  allToggle: 'All sites',
  sitesLabel: 'Sites they may see',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving…',
  saved: (email: string) => `Allowed sites for ${email} saved`,
})
