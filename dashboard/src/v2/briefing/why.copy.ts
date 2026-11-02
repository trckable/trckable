// The words of "Why?".
import { defineCopy } from '../../i18n'

export const copy = defineCopy('why', {
  why: 'Why?',
  post: (host: string, title: string, at: string, points: number, comments: number, page?: string) =>
    `A post on ${host}, “${title}”, at ${at} (${points} points, ${comments} comments) is the likely reason.${page ? ` People who follow it land on ${page}.` : ''}`,
  downBecause: (d: string, cause: string) => `${d} stopped answering: ${cause}.`,
  downUnknown: (d: string) => `${d} did not answer our check. We cannot say why from here.`,
  checkServer: 'Check that your server and its address are up. We keep asking every minute and tell you when it answers.',
  lookBack: 'Look at what changed around then: a deploy, a certificate, a provider.',
  askWhy: (cause: string) => `Why is this? ${cause}`,
})
