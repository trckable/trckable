// The words of "Shared with you" in the account window.
export const shared = {
  head: 'Shared with you',
  leave: 'Leave',
  hint: (role: string, sites: number) => `${role === 'owner' ? 'Owner' : 'Viewer'} · ${sites === 1 ? '1 site' : `${sites} sites`}`,
  title: (name: string) => `Leave ${name}?`,
  body: 'Their sites leave your list. You can join again only if they invite you.',
}
