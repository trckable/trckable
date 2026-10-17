// What the script records (ScriptRecords.tsx): the words, in one place.
import { defineCopy } from '../i18n'

export const recordsCopy = defineCopy('records', {
  title: 'What the script records',
  lead: 'Everything else is simply there. These change what the browser sends, so each line says what it adds to the script.',
  total: (size: string) => `Script ${size}`,
  adds: (size: string) => `Adds ${size}.`,
  free: 'Nothing added.',
  foot: 'Turning one off stops new data. What was recorded stays. Changes reach visitors within an hour. Installed with npm? Features are chosen when your app is built.',
  offTitle: (name: string) => `Turn off ${name}?`,
  offStays: 'Nothing already recorded is deleted.',
  turnOff: 'Turn off',
  keep: 'Keep it on',
  consent: {
    button: 'Ask before counting',
    title: 'Ask visitors before counting them?',
    body: 'Until someone agrees, the script stores nothing, and someone who says no is not counted at all. A returning visitor looks new before they agree, so multi-day attribution starts at consent. You choose how it asks in this section.',
  },
  outbound: 'Outbound links and downloads',
  forms: 'Form submissions',
  goals: { name: 'Goals', hint: 'Count signups, trials and anything else you mark, with properties.' },
  vitals: { name: 'Core Web Vitals', hint: 'How fast your pages feel, measured by the browsers that visited them.' },
  heatmaps: { name: 'Heatmaps', hint: 'Where people click on a page, and where they stop. Nobody is recorded.' },
})
