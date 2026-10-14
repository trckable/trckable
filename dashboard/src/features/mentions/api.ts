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
  front?: boolean
  posted_at: number
  found_at: number
  /** People who came from it, counted for two days after it was posted. */
  visitors: number
  peak_hour?: number
  /** Sending people right now. */
  driving?: boolean
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

export const mentionsApi = {
  list: (site: string, period: '7d' | '30d', signal?: AbortSignal) => call<Mentions>('GET', `${base(site)}?period=${period}`, undefined, signal, true),
  setWords: (site: string, keywords: string[]) => call<Words>('PUT', `${base(site)}/keywords`, { keywords }),
}
