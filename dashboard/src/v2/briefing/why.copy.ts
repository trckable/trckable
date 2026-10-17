// The words of "Why?".
import { defineCopy } from '../../i18n'

export const copy = defineCopy('why', {
  why: 'Why?',
  post: (host: string, title: string, at: string, points: number, comments: number, page?: string) =>
    `A post on ${host}, “${title}”, at ${at} (${points} points, ${comments} comments) is the likely reason.${page ? ` People who follow it land on ${page}.` : ''}`,
  replyEarly: 'Reply in the thread early: that is when it helps most.',
  whoNotWhy: (name: string, now: string, usual: string) => `${name} sent ${now} people, usually ${usual}. We can tell who sent them, not why: only you know what was shared there.`,
  answerThem: (name: string) => `Answer the people from ${name} while they are here.`,
  downBecause: (d: string, cause: string) => `${d} stopped answering: ${cause}.`,
  downUnknown: (d: string) => `${d} did not answer our check. We cannot say why from here.`,
  checkServer: 'Check that your server and its address are up. We keep asking every minute and tell you when it answers.',
  lookBack: 'Look at what changed around then: a deploy, a certificate, a provider.',
  noWeeks: (l: string) => `${l} has no earlier days to be told against yet.`,
  weeksSaid: (l: string, now: string, weekday: string, at: string, list: string) => `${l} so far today: ${now}. The same stretch (up to ${at}) on the last ${weekday}s: ${list}.`,
  askWhy: (cause: string) => `Why is this? ${cause}`,
  sourceBelow: 'Open Explore to see which source or page moved it.',
})
