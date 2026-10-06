// Which of Data's two views is on. The story is the default; an address that
// already narrows the numbers (a filter, a day, Full) is
// Explore, so links people saved or shared keep opening what they were.
import type { ViewState } from '../../lib/url'

export const storyOn = (view: ViewState): boolean => (view.v ? view.v === 'story' : !(view.filters.length > 0 || view.day || view.mode === 'full'))
