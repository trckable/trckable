// The account window's own words: its tabs and its title.
export const copy = {
  account: 'Profile',
  accountLabel: 'Profile, your account',
  owner: 'Owner',
  viewer: 'Viewer',
  tabs: {
    sites: 'Sites',
    keys: 'API keys',
    people: 'People',
    profile: 'Account',
  },
  /** The People header: "3 · 1 owner · 2 viewers". */
  count: (c: { people: number; owners: number; viewers: number }) =>
    [String(c.people), plural(c.owners, 'owner', 'owners'), plural(c.viewers, 'viewer', 'viewers')].join(' · '),
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
