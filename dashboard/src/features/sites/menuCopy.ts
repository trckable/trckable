// Every word of the site switcher's list, loaded with it (copy.ts has the
// button's few).
import { copy as first } from './copy'

export const copy = {
  all: first.all,
  sites: 'Sites',
  search: 'Search sites',
  noMatch: (q: string) => `No site matches “${q}”.`,
  add: 'Add a site',
  yourOrder: 'Switcher order',
  pinned: 'Pinned',
  others: 'Other sites',
  emptyGroup: 'Drag a site here, or use a site’s ⋯ menu.',

  // A site's state, under its name, when the dot alone can't say it.
  notInstalled: 'not installed yet',
  stopped: 'stopped',

  // Arranging.
  options: (name: string) => `${name}: arrange`,
  up: 'Move up',
  down: 'Move down',
  pin: 'Pin to top',
  unpin: 'Unpin',
  toGroup: (g: string) => `Move to ${g}`,
  noGroup: 'Take out of its group',
  newGroup: 'New group…',
  newGroupTitle: 'New group',
  newGroupBody: 'A heading in the switcher, like “Clients” or “Shops”. Everyone on the team sees the same groups.',
  groupName: 'Group name',
  create: 'Create',
  groupOptions: (g: string) => `${g}: group options`,
  collapse: (g: string, n: number) => `${g}, ${n === 1 ? '1 site' : `${n} sites`}`,
  rename: 'Rename…',
  renameTitle: (g: string) => `Rename “${g}”`,
  save: 'Save',
  groupUp: 'Move group up',
  groupDown: 'Move group down',
  removeGroup: 'Remove group',
  removeGroupTitle: (g: string) => `Remove the group “${g}”?`,
  removeGroupBody: 'Its sites stay: they go back to the list. Only the heading goes.',
  remove: 'Remove',
  keys: 'Alt + ↑ / ↓ moves the focused site. Drag to reorder.',
  dragged: (name: string, where: string) => `${name} moved to ${where}`,
}
