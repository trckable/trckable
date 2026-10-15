// The sources a marker may name: nine places people come from, each by the
// hosts the report lists them under. A source's visitors on a day are those of
// all its hosts; the host that sent most is the one a click filters to.
// Names are proper nouns and stay the same in every language. Pure.

export interface Known {
  id: string
  name: string
  /** What the badge on the chart says: two letters at most. */
  badge: string
  hosts: string[]
}

export const KNOWN: Known[] = [
  { id: 'hn', name: 'Hacker News', badge: 'HN', hosts: ['news.ycombinator.com'] },
  { id: 'ih', name: 'Indie Hackers', badge: 'IH', hosts: ['indiehackers.com'] },
  { id: 'ph', name: 'Product Hunt', badge: 'PH', hosts: ['producthunt.com'] },
  { id: 'reddit', name: 'Reddit', badge: 'R', hosts: ['reddit.com', 'old.reddit.com'] },
  { id: 'x', name: 'X', badge: 'X', hosts: ['x.com', 't.co', 'twitter.com'] },
  { id: 'linkedin', name: 'LinkedIn', badge: 'in', hosts: ['linkedin.com', 'lnkd.in'] },
  { id: 'google', name: 'Google', badge: 'G', hosts: ['google.com'] },
  { id: 'bing', name: 'Bing', badge: 'B', hosts: ['bing.com'] },
  { id: 'ai', name: 'ChatGPT', badge: 'AI', hosts: ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai'] },
]

/** The most hosts one request asks about (the server's limit for a sparkline request). */
export const CHUNK = 12

/** Every host, in groups the server answers in one request each. */
export function hostChunks(): string[][] {
  const all = KNOWN.flatMap((k) => k.hosts)
  const out: string[][] = []
  for (let i = 0; i < all.length; i += CHUNK) out.push(all.slice(i, i + CHUNK))
  return out
}

export const byId = (id: string): Known | undefined => KNOWN.find((k) => k.id === id)
