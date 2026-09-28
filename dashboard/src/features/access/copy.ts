// Every word site access shows, in one place: the dashboard's text moves to
// message files when translations come, and this is what moves.
export const copy = {
  all: 'All sites',
  some: (n: number, of: number) => `${n} of ${of} sites`,
  none: 'No sites',
  edit: 'Site access',
  editFor: (email: string) => `Site access for ${email}`,
  mode: 'Which sites',
  allOption: 'All sites',
  someOption: 'Some',
  sitesLabel: 'Sites they may see',
  done: 'Done',
  saved: (email: string) => `Site access for ${email} saved`,
}
