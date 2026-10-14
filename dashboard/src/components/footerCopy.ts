// The page foot's own words (Footer.tsx). The lazy parts' words are in footerMoreCopy.ts.
import { defineCopy } from '../i18n'

export const footerCopy = defineCopy('footer', {
  newer: (v: string) => `v${v} is out`,
  changelog: 'Changelog',
  docs: 'Docs',
  feedback: 'Feedback',
  shortcuts: 'Keyboard shortcuts',
})
