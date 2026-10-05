// The dialog behind a guide card or a moment: one line on what it is. Apart from
// copy.ts so the first load does not carry it; only the dialogs import it.
import { defineCopy } from '../../i18n'

export const modalCopy = defineCopy('moments.modal', {
  chart: 'The days around it',
  exclude: 'Your own clicks count as visitors. Leave this browser out and every number is someone else.',
  replay: 'Replay plays the period back as a short story, day by day.',
  full: 'Full shows every card: pages, sources, countries, devices, goals and more.',
  weekly: 'One short email a week with your numbers. Turn it off any time.',
  crawlers: 'Turn on the AI crawler numbers to see which AI robots read your site.',
  search: 'Connect Google Search Console to see what people search for, beside your own numbers.',
})
