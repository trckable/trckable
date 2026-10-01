// Every word of the Track a goal dialog (AddGoals.tsx): this is what moves to
// the message files when translations come.
export const copy = {
  label: 'Add goals',
  title: 'Track a goal',
  hint: 'Count a signup, a trial, a download.',
  methods: 'How to count it',
  routes: {
    page: { name: 'Page visit', hint: 'No code at all' },
    html: { name: 'Button or link', hint: 'One attribute' },
    js: { name: 'Your code', hint: 'One call on success' },
    api: { name: 'Your server', hint: 'What the browser never sees' },
  },
  hints: {
    html: 'Extra data-trckable-* attributes become properties.',
    js: 'Call it when the action succeeded, not on the click.',
    api: 'Send the visitor id from the trckable_vid cookie.',
  },
  name: 'Goal name',
  namePlaceholder: 'Saw pricing',
  page: 'Page',
  pagePlaceholder: '/pricing',
  pageHelp: 'Counted from the pageviews already recorded, so the past shows too. End a path with * for everything under it, like /blog/*.',
  exists: 'There is already a goal with that name',
  added: 'Page goals',
  add: 'Add goal',
  done: 'Done',
  viewer: 'Only owners add goals.',
  counts: (n: string) => `"${n}" counts from now on, and for the past too`,
  removed: (n: string) => `"${n}" removed`,
  remove: (n: string) => `Remove the goal ${n}`,
  removeTip: 'Remove',
}
