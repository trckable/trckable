// Every word of the bounce guide: the popup, the story card, the Sites list button.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('bounce', {
  label: 'Why visitors leave',
  close: 'Close',
  loading: 'Reading the visits…',
  failed: 'Couldn’t read the visits. Try again in a moment.',
  leave: (usual: string) => `leave after one page · usual ~${usual}`,
  since: (day: string) => `since ${day}`,
  cardHigh: (tenths: number, usual: number) => `${tenths} in 10 leave after one page (usual ~${usual} in 10)`,
  cardLow: (tenths: number, usual: number) => `Good news: only ${tenths} in 10 leave after one page (usual ~${usual} in 10)`,
  seeWhy: 'See why',
  normal: (usual: string) => `Nothing unusual. About as many leave after one page as usual (~${usual}).`,
  low: 'Fewer leave after one page than usual. Nothing to fix.',
  spread: 'No single page or source stands out. It is spread over many.',
  leaveHere: (rate: string) => `${rate} leave here`,
  leaveHereWas: (rate: string, was: string) => `${rate} leave here (usually ${was})`,
  ofVisits: (share: string) => `${share} of visits`,
  pageLead: 'Mostly people who land on',
  sourceLead: (source: string, device: string) => `Mostly people from ${source} on ${device}`,
  speedLead: (secs: string) => `The same page takes ${secs} s to show its main content`,
  tryTitle: 'What to try',
  tries: {
    page: 'End the page with links to related pages, so the next step is clear.',
    source_device: 'Open the page the way these visitors do. Check it fits their screen and matches what the link promised.',
    speed: 'Make it faster on phones. Start with the images.',
  },
  seePage: 'See this page',
})
