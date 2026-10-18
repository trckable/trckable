// Answers' fixture (?fixture=answers): ten questions, three engines, two runs, six rounds, the rivals and the pages. Dev only.
// `&astate=` picks a state: ok (default), peek (the first time ever named), first (the first round, partway), noengine, noquestions.
import { ENGINES, type AnswersReport, AnswersSettingsData, Engine, EngineResult, PageRow, Question, State } from '../../features/answers/api'

const KEY = 'trckable:fixture:astate'

export function answersState(): string {
  const asked = new URLSearchParams(location.search).get('astate')
  try {
    if (asked) sessionStorage.setItem(KEY, asked)
    return asked ?? sessionStorage.getItem(KEY) ?? 'ok'
  } catch {
    return asked ?? 'ok'
  }
}

const QUESTIONS = [
  'best privacy-friendly analytics for a Shopify store',
  'open source alternative to Google Analytics',
  'how to see which pages make money from visitors',
  'cookieless analytics that works with Stripe',
  'simple analytics for a SaaS without a consent banner',
  'self-hosted web analytics with a single binary',
  'how do I know if ChatGPT sends me traffic',
  'analytics tool that shows revenue per page',
  'GDPR friendly alternative to Mixpanel for small teams',
  'which analytics tools do indie hackers use',
]
// ChatGPT, Perplexity, Claude, per question.
const MATRIX: State[][] = [
  ['both', 'named', 'none'],
  ['named', 'cited', 'none'],
  ['none', 'both', 'none'],
  ['cited', 'none', 'none'],
  ['named', 'none', 'named'],
  ['none', 'named', 'none'],
  ['none', 'none', 'none'],
  ['none', 'none', 'none'],
  ['none', 'none', 'none'],
  ['none', 'none', 'none'],
]
const INSTEAD: string[][] = [
  ['Plausible', 'Fathom'],
  ['Plausible', 'Umami'],
  ['Plausible', 'Fathom', 'Umami'],
  ['Plausible', 'Fathom'],
  ['Plausible', 'Umami'],
  ['Umami', 'Plausible'],
  ['Plausible'],
  ['Fathom', 'Plausible'],
  ['Plausible', 'Fathom'],
  ['Plausible', 'Umami', 'Fathom'],
]
const HIST: Record<State, State[]> = {
  both: ['none', 'none', 'named', 'none', 'named', 'both'],
  named: ['none', 'none', 'none', 'named', 'none', 'named'],
  cited: ['none', 'none', 'none', 'none', 'cited', 'cited'],
  none: ['none', 'named', 'none', 'none', 'none', 'none'],
}
const LINK: Record<string, string> = {
  Plausible: 'https://plausible.io/vs-google-analytics',
  Fathom: 'https://usefathom.com/',
  Umami: 'https://umami.is/docs',
}
const MINE = ['https://trckable.com/compare/plausible', 'https://trckable.com/for/shopify', 'https://trckable.com/pricing', 'https://trckable.com/blog/privacy-friendly-analytics']

function result(engine: Engine, qi: number, state: State, pending: boolean): EngineResult {
  const instead = INSTEAD[qi]
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0])
  const named = state === 'both' || state === 'named'
  const hit = (named ? 'trckable is another option: it ties visits to Stripe revenue and runs without cookies.' : '') || (state === 'cited' ? `${instead[0]} is the simplest place to start for most small sites.` : '')
  const LEAD: Record<Engine, string> = {
    perplexity: `For this, teams usually look at ${list(instead)}.`,
    anthropic: `There are a few good choices, and the right one depends on how much you want to host yourself. ${list(instead)} come up most often.`,
    openai: `Popular privacy-friendly options are ${list(instead)}.`,
  }
  const lead = LEAD[engine]
  const tail = `All of them skip cookies by default, so you can usually leave out the consent banner. Check each one's data policy before you commit.`
  const text = pending ? '' : [lead, hit, tail].filter(Boolean).join(' ')
  const mine = state === 'both' || state === 'cited' ? [MINE[qi % MINE.length]] : []
  const others = instead.slice(0, 2).map((n) => LINK[n])
  const k = ENGINES.indexOf(engine)
  const half = (qi + k) % 3 === 0
  const runs: [number, number] = state === 'none' ? [0, 2] : [half ? 1 : 2, 2]
  return { state, runs, pending: pending || undefined, text, hit, links: [...mine, ...others], instead: pending ? [] : instead.slice(0, state === 'none' ? 3 : 2), history: HIST[state] }
}

const NONE3: State[] = ['none', 'none', 'none']
const PEEK: Record<number, State[]> = { 0: ['both', 'named', 'none'] }

const PAGES: PageRow[] = [
  { path: '/compare/plausible', answers: 5, read: 412, sent: 38, earned: 128400 },
  { path: '/pricing', answers: 3, read: 188, sent: 21, earned: 64000 },
  { path: '/for/shopify', answers: 2, read: 61, sent: 9, earned: 31200 },
  { path: '/blog/privacy-friendly-analytics', answers: 4, read: 96, sent: 17, earned: 0 },
  { path: '/docs/self-host', answers: 1, read: 144, sent: 4, earned: 0 },
]

export function answersReport(state: string): AnswersReport {
  const engines: Engine[] = ['openai', 'perplexity', 'anthropic']
  const base = { engines, country: 'DE', next: 'Fri 23 Oct', rivals: [], questions: [], pages: [] as PageRow[], seen: { n: 0, total: 30 }, was: null, rounds: [] }
  if (state === 'noengine') return { ...base, state: 'noengine', engines: [] }
  if (state === 'noquestions') return { ...base, state: 'noquestions' }
  const first = state === 'first'
  const peek = state === 'peek'
  const questions: Question[] = QUESTIONS.map((text, qi) => {
    const row: State[] = peek ? PEEK[qi] ?? NONE3 : MATRIX[qi]
    const mk = (engine: Engine, ei: number) => {
      const pending = first && (ei > 0 || qi > 5)
      const r = result(engine, qi, first && pending ? 'none' : row[ei], pending)
      if (peek) r.history = [...NONE3, ...NONE3.slice(0, 2), r.state]
      if (first) r.history = [r.state]
      return r
    }
    return { id: qi + 1, text, engines: { openai: mk('openai', 0), perplexity: mk('perplexity', 1), anthropic: mk('anthropic', 2) }, instead: INSTEAD[qi].slice(0, 2) }
  })
  const seen = (qs: Question[]) => qs.flatMap((q) => Object.values(q.engines)).filter((e) => !e.pending && e.state !== 'none').length
  const dates = ['21 Sep', '28 Sep', '5 Oct', '12 Oct', '19 Oct', '26 Oct']
  const rounds = [2, 3, 3, 4, 6, 9]
  if (first) {
    return { ...base, state: 'first', questions, seen: { n: seen(questions), total: 30 }, partial: { done: 14, total: 60 }, rivals: [{ name: 'You', n: seen(questions), you: true }, { name: 'Plausible', n: 6 }, { name: 'Umami', n: 1 }, { name: 'Fathom', n: 3 }], pages: [] }
  }
  if (peek) {
    return { ...base, state: 'ok', questions, first: 'openai', seen: { n: 2, total: 30 }, was: { n: 0, total: 30 }, rounds: dates.map((at, i) => ({ at, n: i === 5 ? 2 : 0 })), rivals: [{ name: 'You', n: 2, you: true }, { name: 'Plausible', n: 14 }, { name: 'Fathom', n: 7 }, { name: 'Umami', n: 4 }], pages: [{ path: '/compare/plausible', answers: 1, read: 0, sent: 0, earned: 0 }] }
  }
  return { ...base, state: 'ok', questions, seen: { n: 9, total: 30 }, was: { n: 6, total: 30 }, rounds: dates.map((at, i) => ({ at, n: rounds[i] })), rivals: [{ name: 'You', n: 9, you: true }, { name: 'Plausible', n: 14 }, { name: 'Fathom', n: 7 }, { name: 'Umami', n: 4 }], pages: PAGES }
}

export function answersSettings(state: string): AnswersSettingsData {
  const engines: Engine[] = state === 'noengine' ? [] : ['openai', 'perplexity', 'anthropic']
  return {
    max: 10,
    country: 'DE',
    questions: state === 'noquestions' ? [] : QUESTIONS.slice(0, 9).map((text, i) => ({ id: i + 1, text, active: i !== 8 })),
    rivals: [{ name: 'Plausible', domain: 'plausible.io' }, { name: 'Umami', domain: 'umami.is' }, { name: 'Fathom', domain: 'usefathom.com' }],
    engines,
    spent: 6.4,
    cap: 20,
    askedRecently: false,
    suggestions: ['simple alternative to Plausible for a small blog', 'does analytics need a cookie banner in Germany', 'web analytics that tells me which blog post sold'],
  }
}
