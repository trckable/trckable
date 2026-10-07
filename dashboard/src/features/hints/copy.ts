// The hints' words: a bubble's title and buttons, and each hint's line.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('hints', {
  title: 'Did you know?',
  seen: 'Got it',
  off: 'Turn hints off',
  close: 'Close hint',
  story: 'Each answer opens the full picture: chart, every row, export.',
  rows: 'Click any row to filter the whole page by it.',
  peek: (key: string) => `Press ${key} to ask Peek anything about your numbers.`,
})
