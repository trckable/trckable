// The bar over Explore when it was opened from the story (its own chunk), and
// the questions' names the story view shares.
import { defineCopy } from '../../i18n'

export const bar = defineCopy('storyview.bar', {
  fromStory: 'From your story',
  back: 'Back to the story',
  clear: 'Clear filters',
  to: 'to',
  fromMoment: 'A moment',
  q: {
    did: 'Did it work?',
    page: 'Which page carries you?',
    fix: 'What should I fix?',
    pays: 'Which source pays?',
    fine: 'Is it good or bad?',
  },
})

export const switchWords = defineCopy('storyview.switch', { story: 'Story', explore: 'Explore', label: 'Story or Explore' })

/** The title of the answer (or moment) Explore was opened from; none for an unknown key. */
export const fromTitle = (key: string | undefined): string | null => {
  if (!key) return null
  if (key === 'moment') return bar.fromMoment
  return Object.hasOwn(bar.q, key) ? bar.q[key as keyof typeof bar.q] : null
}
