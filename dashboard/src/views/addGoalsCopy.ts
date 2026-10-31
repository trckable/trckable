// Every word of the Track a goal dialog (AddGoals.tsx): this is what moves to
// the message files when translations come.
import { defineCopy } from '../i18n'

export const copy = defineCopy('goals', {
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
  appears: {
    html: 'It shows up in Goals after the first click. Nothing to save.',
    js: 'It shows up in Goals after the first event. Nothing to save.',
    api: 'It shows up in Goals after the first event. Nothing to save.',
  },
  signup: { label: 'Counts as signup', help: 'The goal behind Signups and the signup rate.', auto: 'Automatic', none: 'None', saved: (n: string) => `${n} counts as the signup`, savedNone: 'No goal counts as the signup', savedAuto: 'The signup is picked by its name' },
  name: 'Goal name',
  namePlaceholder: 'Saw pricing',
  page: 'Page',
  pagePlaceholder: '/pricing',
  pageHelp: 'Counted from the pageviews already recorded, so the past shows too. End a path with * for everything under it, like /blog/*.',
  exists: 'You already have a goal with that name. Pick a different one.',
  added: 'Page goals',
  add: 'Add goal',
  done: 'Done',
  viewer: 'Only owners add goals.',
  counts: (n: string) => `"${n}" counts from now on, and for the past too`,
  removed: (n: string) => `"${n}" removed`,
  remove: (n: string) => `Remove the goal ${n}`,
  removeTip: 'Remove',
  suggested: {
    heading: 'Suggested',
    names: { thanks: 'Reached thank-you page', confirm: 'Reached confirmation page', welcome: 'Reached welcome page', signup: 'Opened sign up', pricing: 'Opened pricing', contact: 'Opened contact' },
    add: 'Add',
    addTip: (n: string) => `Count ${n}`,
    forms: 'Form submissions',
    formsPath: 'every form sent',
    formsOn: 'Form submissions count from now on',
  },
})
