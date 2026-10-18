// What the server will answer for Answers. Prototype: the development fixture answers these.
import { call } from '../../lib/api'
import type { ReportQuery } from '../../lib/api'

export type Engine = 'openai' | 'perplexity' | 'anthropic'
export type State = 'both' | 'named' | 'cited' | 'none'
export const ENGINES: Engine[] = ['openai', 'perplexity', 'anthropic']

export interface EngineResult {
  state: State
  /** Runs that named or linked the site, out of the runs asked. */
  runs: [number, number]
  /** Still being asked (the first round). */
  pending?: boolean
  text: string
  /** The sentence of the answer that names the site. */
  hit: string
  links: string[]
  instead: string[]
  /** The last rounds, oldest first. */
  history: State[]
}

export interface Question {
  id: number
  text: string
  engines: Record<Engine, EngineResult>
  instead: string[]
}

export interface PageRow {
  path: string
  answers: number
  read: number
  sent: number
  /** Minor units. */
  earned: number
}

export interface AnswersReport {
  state: 'ok' | 'first' | 'noengine' | 'noquestions'
  engines: Engine[]
  seen: { n: number; total: number }
  was: { n: number; total: number } | null
  rounds: { at: string; n: number }[]
  country: string
  next: string
  partial?: { done: number; total: number }
  /** The engine that named the site for the first time ever. */
  first?: Engine
  rivals: { name: string; n: number; you?: boolean }[]
  questions: Question[]
  pages: PageRow[]
}

export interface AnswersSettingsData {
  max: number
  country: string
  questions: { id: number; text: string; active: boolean }[]
  rivals: { name: string; domain: string }[]
  engines: Engine[]
  spent: number
  cap: number
  askedRecently: boolean
  suggestions: string[]
}

const qs = (q: ReportQuery) => `?from=${q.from}&to=${q.to}`

export const answersApi = {
  report: (site: string, q: ReportQuery, signal?: AbortSignal) => call<AnswersReport>('GET', `/sites/${site}/report/answers${qs(q)}`, undefined, signal),
  settings: (site: string, signal?: AbortSignal) => call<AnswersSettingsData>('GET', `/sites/${site}/answers`, undefined, signal),
}
