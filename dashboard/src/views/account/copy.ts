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
    languageHint: 'The page starts again in the language you pick',
    featuresHint: 'Everything trckable can do, and what is new',
    open: 'Open',
    new: 'New',
    installHint: 'Open trckable from your home screen or dock, like any app',
    privacy: 'Privacy',
    ownVisits: 'Your own visits',
    ownVisitsHint: (site: string) => `Opens ${site} once in a new tab, where the tracker keeps this browser out of its counts, or counts it again`,
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
