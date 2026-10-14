// What the small panel under each answer says: what was measured is the
// answer's own line (rules.ts); these are why it matters. Its own chunk,
// loaded when a panel is first opened.
import { defineCopy } from '../../i18n'

export const explainCopy = defineCopy('storyview.explain', {
  measured: 'What we measured',
  matters: 'Why it matters',
  why: {
    did: 'It shows whether more people come than before, so you know if your last change helped.',
    page: 'This is the first page most people see, so it is your front door.',
    fix: 'A visitor who leaves after one page did not find what they came for.',
    pays: 'Knowing which source brings sales tells you where your effort pays off.',
    fine: 'It sets your visitors, how long they stay and how many leave after one page against the period before.',
  },
})
