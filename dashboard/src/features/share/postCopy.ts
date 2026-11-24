// The words a post is written in (postWriter.ts): the sentence of each card, around the numbers the card itself says.
import { defineCopy } from '../../i18n'

export const postCopy = defineCopy('sharePost', {
  head: {
    overview: (big: string, label: string, domain: string, period: string) => `${big} ${label} on ${domain}, ${period}`,
    changed: (domain: string, period: string, said: string) => `What changed on ${domain}, ${period}: ${said}`,
    bestday: (domain: string, big: string, noun: string, day: string) => `Our best day on ${domain}: ${big} ${noun}, ${day}`,
    milestone: (domain: string, big: string, label: string) => `We reached ${big} ${label} on ${domain}`,
    sources: (domain: string, period: string) => `Where people come from on ${domain}, ${period}`,
    search: (domain: string, period: string) => `Seen in Google: ${domain}, ${period}`,
    toppage: (domain: string, period: string) => `The most visited page on ${domain}, ${period}`,
    leaderboard: (domain: string, period: string) => `Top pages on ${domain}, ${period}`,
  },
  person: (n: number) => (n === 1 ? 'person' : 'people'),
  against: (arrow: string, pct: string, vs: string) => `${arrow} ${pct} vs ${vs}`,
  topSource: (name: string) => `Top source: ${name}`,
  closing: 'Counted without cookies, with trckable.',
  closingPlain: 'Counted without cookies.',
  reset: 'Reset text',
})
