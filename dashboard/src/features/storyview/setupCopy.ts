// The words of the setup card at the top of the story.
import { defineCopy } from '../../i18n'

export const setup = defineCopy('storysetup', {
  eyebrow: (done: number) => `Next step · ${done} of 4 done`,
  title: (site: string) => `Finish setting up ${site}`,
  progress: (done: number) => `${done} of 4 steps done`,
  steps: {
    snippet: 'Install snippet',
    verify: 'Verify tracking',
    goal: 'Set a goal',
    revenue: 'Connect revenue',
  },
  later: 'Later',
  go: {
    snippet: 'Install snippet',
    verify: 'Verify tracking',
    goal: 'Set a goal',
    revenue: 'Connect revenue',
  },
  stepDone: 'done',
  stepOpen: 'to do',
})
