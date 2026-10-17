// What the server found: GET /sites/{site}/mentions and its words.
import { call } from '../../lib/api'

export type Source = 'hn' | 'ph' | 'news'

export interface Mention {
  id: number
  source: Source
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

export interface Words {
  default: string[]
  added: string[]
  max: number
}

export interface Mentions {
  mentions: Mention[]
  sources: Source[]
  words: Words
  driving: Mention | null
}

const base = (site: string) => `/sites/${encodeURIComponent(site)}/mentions`

/** A page the visits confirmed ("ref") is shown with the news until the screens name it. */
const known = (m: Mention): Mention => ((m.source as string) === 'ref' ? { ...m, source: 'news' } : m)

export const mentionsApi = {
  list: (site: string, period: Period, signal?: AbortSignal) =>
    call<Mentions>('GET', `${base(site)}?period=${period}`, undefined, signal, true).then((r) => ({ ...r, mentions: r.mentions.map(known), driving: r.driving && known(r.driving) })),
  curves: (site: string, period: Period, signal?: AbortSignal) => call<Curves>('GET', `${base(site)}/curves?period=${period}`, undefined, signal, true),
  detail: (site: string, id: number, signal?: AbortSignal) =>
    call<Detail>('GET', `${base(site)}/${id}`, undefined, signal, true).then((r) => ({ ...r, mention: known(r.mention) })),
  setWords: (site: string, keywords: string[]) => call<Words>('PUT', `${base(site)}/keywords`, { keywords }),
}
