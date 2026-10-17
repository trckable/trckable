// What the server found: GET /sites/{site}/mentions and its words.
import { call } from '../../lib/api'

/** `ref` is a page that sent visitors: the visits confirm it. */
export type Source = 'hn' | 'ph' | 'news' | 'ref'

export interface Mention {
  id: number
  source: Source
  /** `page`: confirmed by the visits that came from it. */
  via?: string
  url: string
  kind?: 'comment'
  title: string
  author?: string
  host: string
  points?: number
  /** Hacker News comments on the story. */
  comments?: number
  /** The sentence that matched the words, up to 280 characters. */
  snippet?: string
  front?: boolean
  posted_at: number
  found_at: number
  /** People who came from it, counted for two days after it was posted. */
  visitors: number
  peak_hour?: number
  /** Sending people right now. */
  driving?: boolean
}

export type Period = '7d' | '30d' | '90d' | '1y'

/** Visitors that came from a mention's host, hour by hour from ten minutes before it was posted. */
export interface Curves {
  curves: Record<string, number[]>
  step: number
  lead: number
}

export interface Named {
  name: string
  visitors: number
}

export interface Detail {
  mention: Mention
  curve: number[]
  /** Everyone, in the same hours: the usual traffic the curve is drawn over. */
  usual: number[]
  step: number
  lead: number
  pages: Named[]
  countries: Named[]
  /** Visitors from it who reached a goal. */
  goals: number
}

/** What the owner says counts as a mention of the site. */
export interface Rules {
  topic: string[]
  required: string[]
  excluded: string[]
  blocked: string[]
}

export interface Words {
  default: string[]
  added: string[]
  max: number
  /** The name in the address, offered and not searched until added. */
  suggested: string[]
  rules: Rules
}

/** What the news says about a word that is about to be added. */
export interface LookAlike {
  word: string
  checked: boolean
  elsewhere: number
  examples: string[]
  suggest_exclude: string[]
}

/** The answer to "Not about us": what could keep the like of it out. */
export interface Hidden {
  hidden: boolean
  suggest_exclude: string[]
  suggest_block: string
}

export interface Mentions {
  mentions: Mention[]
  sources: Source[]
  words: Words
  driving: Mention | null
}

const base = (site: string) => `/sites/${encodeURIComponent(site)}/mentions`

export const mentionsApi = {
  list: (site: string, period: Period, signal?: AbortSignal) => call<Mentions>('GET', `${base(site)}?period=${period}`, undefined, signal, true),
  curves: (site: string, period: Period, signal?: AbortSignal) => call<Curves>('GET', `${base(site)}/curves?period=${period}`, undefined, signal, true),
  detail: (site: string, id: number, signal?: AbortSignal) => call<Detail>('GET', `${base(site)}/${id}`, undefined, signal, true),
  setWords: (site: string, keywords: string[]) => call<Words>('PUT', `${base(site)}/keywords`, { keywords }),
  setRules: (site: string, rules: Rules) => call<Rules>('PUT', `${base(site)}/rules`, rules),
  hidden: (site: string, signal?: AbortSignal) => call<{ mentions: Mention[] }>('GET', `${base(site)}/hidden`, undefined, signal, true),
  lookAlike: (site: string, word: string) => call<LookAlike>('GET', `${base(site)}/lookalike?word=${encodeURIComponent(word)}`, undefined, undefined, true),
  notAboutUs: (site: string, id: number) => call<Hidden>('POST', `${base(site)}/${id}/not-about-us`),
  restore: (site: string, id: number) => call<{ hidden: boolean }>('POST', `${base(site)}/${id}/restore`),
}
