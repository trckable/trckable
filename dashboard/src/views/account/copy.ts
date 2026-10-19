// The account window's own words: its tabs and its title.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('account', {
  account: 'Profile',
  appearance: 'Appearance',
  accountLabel: 'Profile, your account',
  owner: 'Owner',
  viewer: 'Viewer',
  /** The lines that came from the avatar menu. */
  lines: {
    languageHint: 'The dashboard language',
    featuresHint: 'What the script records',
    open: 'Open',
    new: 'New',
    installHint: 'Open it like an app',
    privacy: 'Privacy',
    ownVisits: 'Your own visits',
    leave: 'Exclude',
    again: 'Count again',
    ownVisitsHint: { excluded: 'This browser is left out', counted: 'This browser is counted', unknown: 'Leave out this browser' },
  },
  tabs: {
    sites: 'Sites',
    keys: 'API keys',
    people: 'People',
    profile: 'Account',
  },
  /** What sits under each tab's icon on a phone. */
  short: {
    sites: 'Sites',
    keys: 'Keys',
    people: 'People',
    profile: 'Account',
  },
  /** The People header: "3 · 1 owner · 2 viewers". */
  count: (c: { people: number; owners: number; viewers: number }) =>
    [String(c.people), plural(c.owners, 'owner', 'owners'), plural(c.viewers, 'viewer', 'viewers')].join(' · '),
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
