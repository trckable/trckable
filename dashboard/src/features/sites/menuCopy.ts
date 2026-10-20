// Every word of the site switcher's list, loaded with it (copy.ts has the
// button's few).
import { copy as first } from './copy'
import { defineCopy } from '../../i18n'

export const copy = defineCopy('sites.menu', {
  all: first.all,
  sites: 'Sites',
  search: 'Search sites',
  noMatch: (q: string) => `No site matches “${q}”.`,
  add: 'Add a site',
  siteSettings: 'Site settings',
  share: 'Share',
  statusPage: 'Status page',
  widgets: 'Widgets',
  yourOrder: 'Switcher order',
  pinned: 'Pinned',
  others: 'Other sites',
  emptyGroup: 'Drag a site here, or use a site’s ⋯ menu.',

  // A site's state, where its number would be, when the dot alone can't say it.
  setup: 'setup',
  notVerified: 'Not verified',
  notVerifiedTip: 'No visit has arrived yet. Open Install to finish and check it.',
  installHelp: 'Install help',
  downTip: (span: string) => `Not reachable for ${span}. Open the site to see what’s wrong.`,
  downShort: (span: string) => `down ${span}`,
  noLiveVisits: 'No live visits yet',
  quietShort: (span: string) => `quiet ${span}`,
  quietTip: (span: string) => `No visits for ${span}. Nothing looks wrong with the page.`,

  // All sites: how many of the listed sites are not fine, under its name.
  downCount: (n: number) => `${n} down`,
  quietCount: (n: number) => `${n} quiet`,
  unverifiedCount: (n: number) => `${n} not verified`,

  // The numbers: today's visitors per site, and both totals beside All sites.
  today: (n: string) => `${n} today`,
  todayAll: 'Visitors today, all sites',

  openSite: (domain: string) => `Open ${domain}`,

  // Arranging.
  options: (name: string) => `${name}: options`,
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
  movedTo: (name: string, n: number) => `Moved ${name} to position ${n}`,
  dragged: (name: string, where: string) => `${name} moved to ${where}`,
})
