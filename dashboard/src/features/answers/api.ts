// What the server answers for Answers (docs/answers.md): the report, the setup, the one question's rounds, and the
// writes. Times are unix seconds; money is minor units.
import { call, rangeQS } from '../../lib/api'
import type { ReportQuery } from '../../lib/api'

export type Engine = 'openai' | 'perplexity' | 'anthropic'
export type State = 'both' | 'named' | 'cited' | 'none'
export const ENGINES: Engine[] = ['openai', 'perplexity', 'anthropic']

/** One assistant's runs for one question in the latest round. */
export interface Cell {
  seen: number
  runs: number
  named: number
  cited: number
  /** The best place among the names, 0 when not named. */
  position: number
}

export interface Row {
  id: number
  text: string
  active: boolean
  /** An assistant with no key on the server is absent. */
  engines: Partial<Record<Engine, Cell>>
  state: State
  instead: string[]
  pages: string[]
}

export interface Round {
  round: number
  seen: number
  total: number
}

export interface PageRow {
  path: string
  answers: number
  /** Left out while the analytics store is not ready (and `revenue` while the revenue module is off). */
  read?: number
  sent?: number
  revenue?: number
}

export interface Change {
  at: number
  engine: Engine
  question_id: number
  question: string
  kind: 'seen' | 'dropped'
  first_ever?: boolean
}

export interface AnswersReport {
  engines: Engine[]
  latest?: (Round & { complete: boolean }) | null
  was?: Round | null
  rivals?: { name: string; seen: number; total: number }[]
  questions?: Row[]
  pages?: PageRow[]
  money?: { currency: string; exponent: number }
  rounds?: Round[]
  changes?: Change[]
  paused?: boolean
  next_at?: number
  country?: string
}

export interface Question {
  id?: number
  text: string
  active: boolean
}

export interface Competitor {
  name: string
  domain: string
}

export interface AnswersSetup {
  engines: { id: Engine; name: string }[]
  questions?: Required<Question>[]
  competitors?: Competitor[]
  words?: string[]
  max?: number
  max_competitors?: number
  country?: string
  next_at?: number
  round?: { done: number; total: number }
  asked_at?: number
  /** Only for someone who can change settings; USD. */
  /** This site's spend against its share; `server` is the whole server's, for the operator only. */
  budget?: { used: number; cap: number; paused: boolean; server?: { used: number; cap: number } } | null
}

export interface Cited {
  url: string
  title: string
}

export interface Run {
  run: number
  ok: boolean
  error: string
  asked_at: number
  text: string
  citations: Cited[]
  sources: Cited[]
  named: boolean
  cited: boolean
  position: number
  sentence: string
  rivals: { name: string; named: boolean; cited: boolean; position: number }[]
}

export interface QuestionRounds {
  id: number
  text: string
  active: boolean
  /** Newest first. */
  rounds: { round: number; engines: Partial<Record<Engine, Run[]>> }[]
}

export interface Suggestions {
  questions: string[]
  competitors: Competitor[]
}

const base = (site: string) => `/sites/${site}`
const put = <T>(site: string, path: string, body: unknown) => call<T>('PUT', `${base(site)}/answers/${path}`, body)

export const answersApi = {
  report: (site: string, q: ReportQuery, signal?: AbortSignal) => call<AnswersReport>('GET', `${base(site)}/report/answers${rangeQS(q)}`, undefined, signal),
  setup: (site: string, signal?: AbortSignal) => call<AnswersSetup>('GET', `${base(site)}/answers/setup`, undefined, signal),
  question: (site: string, id: number, signal?: AbortSignal) => call<QuestionRounds>('GET', `${base(site)}/answers/questions/${id}`, undefined, signal),
  suggestions: (site: string) => call<Suggestions>('GET', `${base(site)}/answers/suggestions`),
  saveQuestions: (site: string, questions: Question[]) => put<{ questions: Required<Question>[] }>(site, 'questions', { questions }),
  saveCompetitors: (site: string, competitors: Competitor[]) => put<{ competitors: Competitor[] }>(site, 'competitors', { competitors }),
  saveCountry: (site: string, country: string) => put<{ country: string }>(site, 'country', { country }),
  run: (site: string) => call<{ asked_at: number; next_at: number }>('POST', `${base(site)}/answers/run`),
}
