// The words of the two header menus' items (MoreItems, AccountItems): lazy
// chunks, so none of this is carried by the first load (moreCopy.ts has the
// buttons' own).
import { defineCopy } from '../i18n'

export const copy = defineCopy('items', {
  share: 'Share',
  views: 'Views',
  refresh: 'Refresh',
  create: 'Create…',
  core: 'Core view',
  full: 'Full view',
  export: 'Export as CSV',
  features: 'Features',
  featuresNew: 'Features, new ones',
  shortcuts: 'Shortcuts',
  install: 'Install app',
  installHint: 'Tap Share, then Add to Home Screen',
  language: 'Language',
  languageAuto: 'Auto',
  theme: 'Theme',
  themes: { system: 'Auto', dark: 'Dark', light: 'Light' },
  account: 'Profile',
  signOut: 'Sign out',
  owner: 'Owner',
  viewer: 'Viewer',
  accountLabel: 'Profile, your account',
  milestones: 'Milestones',
  milestonesNew: 'Milestones, new ones',
})
