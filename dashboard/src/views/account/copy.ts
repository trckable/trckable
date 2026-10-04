// The account window's own words: its tabs and its title.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('account', {
  account: 'Profile',
  appearance: 'Appearance',
  accountLabel: 'Profile, your account',
  owner: 'Owner',
  viewer: 'Viewer',
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
