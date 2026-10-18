// Answers' fixture (?fixture=answers): ten questions, three engines, two runs, six rounds, the rivals and the pages. Dev only.
// `&astate=` picks a state: ok (default), peek (the first time ever named), first (the first round, partway), noengine, noquestions.
import type { AnswersReport, AnswersSetup, Cell, Engine, QuestionRounds, Row, Run, State } from '../../features/answers/api'

const KEY = 'trckable:fixture:astate'
const WEEK = 7 * 86400

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
const ENGINES: Engine[] = ['openai', 'perplexity', 'anthropic']
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
const INSTEAD: string[][] = [['Plausible', 'Fathom'], ['Plausible', 'Umami'], ['Plausible', 'Fathom', 'Umami'], ['Plausible', 'Fathom'], ['Plausible', 'Umami'], ['Umami', 'Plausible'], ['Plausible'], ['Fathom', 'Plausible'], ['Plausible', 'Fathom'], ['Plausible', 'Umami', 'Fathom']]
const LINK: Record<string, string> = { Plausible: 'https://plausible.io/vs-google-analytics', Fathom: 'https://usefathom.com/', Umami: 'https://umami.is/docs' }
const MINE = ['/compare/plausible', '/for/shopify', '/pricing', '/blog/privacy-friendly-analytics']
const HIST: Record<State, State[]> = {
  both: ['none', 'none', 'named', 'none', 'named', 'both'],
  named: ['none', 'none', 'none', 'named', 'none', 'named'],
  cited: ['none', 'none', 'none', 'none', 'cited', 'cited'],
  none: ['none', 'named', 'none', 'none', 'none', 'none'],
}
const SEEN = [2, 3, 3, 4, 6, 9]

const cell = (s: State, half: boolean): Cell => {
  if (s === 'none') return { seen: 0, runs: 2, named: 0, cited: 0, position: 0 }
  const named = s === 'both' || s === 'named' ? (half ? 1 : 2) : 0
  const cited = s === 'both' || s === 'cited' ? (half ? 1 : 2) : 0
  return { seen: half ? 1 : 2, runs: 2, named, cited, position: named ? 2 : 0 }
}

const rows = (state: string): Row[] =>
  QUESTIONS.map((text, qi) => {
    const first = state === 'first'
    const row: State[] = state === 'peek' ? (qi === 0 ? ['both', 'named', 'none'] : ['none', 'none', 'none']) : MATRIX[qi]
    const engines: Row['engines'] = {}
    ENGINES.forEach((e, ei) => {
      const pending = first && (ei > 0 || qi > 5)
      if (!pending) engines[e] = cell(row[ei], (qi + ei) % 3 === 0)
    })
    const mine = row.some((s) => s === 'both' || s === 'cited')
    return { id: qi + 1, text, active: qi !== 9 || state !== 'ok', engines, state: row.reduce<State>((b, s) => (s === 'both' || (s !== 'none' && b === 'none') ? s : b), 'none'), instead: INSTEAD[qi].slice(0, 3), pages: mine ? [MINE[qi % MINE.length]] : [] }
  })

export function answersReport(state: string, now: number): AnswersReport {
  if (state === 'noengine') return { engines: [] }
  const base: AnswersReport = { engines: ENGINES, country: 'DE', next_at: now + 5 * 86400, paused: false, money: { currency: 'USD', exponent: 2 } }
  if (state === 'noquestions') return { ...base, questions: [], latest: null, was: null, rounds: [], changes: [], pages: [], rivals: [] }
  const questions = rows(state)
  const total = 30
  const at = (i: number) => now - (SEEN.length - 1 - i) * WEEK - 3 * 3600
  if (state === 'first') return { ...base, questions, latest: { round: now - 3600, seen: 3, total: 14, complete: false }, was: null, rounds: [], changes: [], pages: [], rivals: [], next_at: 0 }
  if (state === 'peek') {
    const rounds = SEEN.map((_, i) => ({ round: at(i), seen: i === 5 ? 2 : 0, total }))
    return { ...base, questions, latest: { ...rounds[5], complete: true }, was: rounds[4], rounds, rivals: [{ name: 'Plausible', seen: 14, total }, { name: 'Fathom', seen: 7, total }, { name: 'Umami', seen: 4, total }], pages: [{ path: '/compare/plausible', answers: 1, read: 0, sent: 0, revenue: 0 }], changes: [{ at: now - 3600, engine: 'openai', question_id: 1, question: QUESTIONS[0], kind: 'seen', first_ever: true }] }
  }
  const rounds = SEEN.map((seen, i) => ({ round: at(i), seen, total }))
  return {
    ...base,
    questions,
    latest: { ...rounds[5], complete: true },
    was: rounds[4],
    rounds,
    rivals: [{ name: 'Plausible', seen: 14, total }, { name: 'Fathom', seen: 7, total }, { name: 'Umami', seen: 4, total }],
    pages: [
      { path: '/compare/plausible', answers: 5, read: 412, sent: 38, revenue: 128400 },
      { path: '/pricing', answers: 3, read: 188, sent: 21, revenue: 64000 },
      { path: '/for/shopify', answers: 2, read: 61, sent: 9, revenue: 31200 },
      { path: '/blog/privacy-friendly-analytics', answers: 4, read: 96, sent: 17, revenue: 0 },
      { path: '/docs/self-host', answers: 1, read: 144, sent: 4, revenue: 0 },
    ],
    changes: [
      { at: now - 2 * 3600, engine: 'perplexity', question_id: 3, question: QUESTIONS[2], kind: 'seen' },
      { at: now - 5 * 86400, engine: 'anthropic', question_id: 5, question: QUESTIONS[4], kind: 'dropped' },
    ],
  }
}

export function answersSetup(state: string, now: number): AnswersSetup {
  if (state === 'noengine') return { engines: [] }
  return {
    engines: [{ id: 'openai', name: 'ChatGPT' }, { id: 'perplexity', name: 'Perplexity' }, { id: 'anthropic', name: 'Claude' }],
    questions: state === 'noquestions' ? [] : QUESTIONS.slice(0, 9).map((text, i) => ({ id: i + 1, text, active: i !== 8 })),
    competitors: [{ name: 'Plausible', domain: 'plausible.io' }, { name: 'Umami', domain: 'umami.is' }, { name: 'Fathom', domain: 'usefathom.com' }],
    words: ['example.com', 'Example'],
    max: 10,
    max_competitors: 5,
    country: 'DE',
    next_at: now + 5 * 86400,
    round: state === 'first' ? { done: 14, total: 60 } : undefined,
    asked_at: 0,
    budget: { used: 6.4, cap: 20, paused: false },
  }
}

const run = (e: Engine, qi: number, r: number, s: State): Run => {
  const named = s === 'both' || s === 'named'
  const cited = s === 'both' || s === 'cited'
  const sentence = named ? 'Example is another option: it ties visits to Stripe revenue and runs without cookies.' : ''
  const rivals = INSTEAD[qi].map((name, i) => ({ name, named: true, cited: i === 0, position: i + 1 }))
  const text = `Popular privacy-friendly options are ${INSTEAD[qi].join(', ')}. ${sentence} All of them skip cookies by default, so you can usually leave out the consent banner.`
  const links = [...(cited ? [{ url: `https://example.com${MINE[qi % MINE.length]}`, title: 'Example' }] : []), ...INSTEAD[qi].slice(0, 2).map((n) => ({ url: LINK[n], title: n }))]
  return { run: r, ok: true, error: '', asked_at: 0, text: e === 'anthropic' ? text.replace('Popular', 'There are a few good choices:') : text, citations: links, sources: [], named, cited, position: named ? 2 : 0, sentence, rivals }
}

export function answersQuestion(id: number, state: string, now: number): QuestionRounds {
  const qi = Math.max(0, Math.min(QUESTIONS.length - 1, id - 1))
  const row: State[] = state === 'peek' ? (qi === 0 ? ['both', 'named', 'none'] : ['none', 'none', 'none']) : MATRIX[qi]
  const rounds = SEEN.map((_, i) => ({
    round: now - (SEEN.length - 1 - i) * WEEK - 3 * 3600,
    engines: Object.fromEntries(ENGINES.map((e, ei) => [e, [1, 2].map((r) => run(e, qi, r, HIST[row[ei]][i] ?? 'none'))])) as QuestionRounds['rounds'][number]['engines'],
  }))
  return { id, text: QUESTIONS[qi], active: true, rounds: rounds.reverse() }
}

/** The writes and the one question's rounds: a write answers as the server does, and keeps nothing. */
export function answersChange(method: string, what: string, id: string | undefined, body: unknown): { status: number; body: unknown } | null {
  const now = Math.floor(Date.now() / 1000)
  const b = (body ?? {}) as { questions?: { id?: number; text: string; active: boolean }[]; competitors?: unknown[]; country?: string }
  if (method === 'GET' && what === 'questions' && id) return { status: 200, body: answersQuestion(Number(id), answersState(), now) }
  if (method === 'PUT' && what === 'questions') return { status: 200, body: { questions: (b.questions ?? []).map((q, i) => ({ ...q, id: q.id ?? 100 + i })) } }
  if (method === 'PUT' && what === 'competitors') return { status: 200, body: { competitors: b.competitors ?? [] } }
  if (method === 'PUT' && what === 'country') return { status: 200, body: { country: b.country ?? '' } }
  if (method === 'POST' && what === 'run') return { status: 200, body: { asked_at: now, next_at: 0 } }
  return null
}
