// The robots that cannot read the site: one card for the answer or index robot that was turned away or found broken
// pages on most of its visits. Training robots are never warned about. Pure: cards.crawl.test.ts.
import { fmtInt } from '../../lib/format'
import { copy } from './cards.copy'
import type { Story } from './cards'

/** One robot on one errand over the period, with the visits that went wrong. */
export interface Robot {
  name: string
  kind: string
  hits: number
  /** Turned away by the server or CDN: 401, 403, 429. */
  blocked: number
  /** Pages that were missing or broken: 404, 5xx and the rest. */
  errors: number
}

/** Fewer visits than this say nothing about a robot. */
const MIN_HITS = 20
/** From this share of its visits going wrong, a robot cannot read the site. */
const MIN_SHARE = 0.5
const DOCS = 'https://docs.trckable.com/reports/ai-search/#letting-robots-in'

// The robot's company is what the report names; the user agents are what a site's own words use for them.
const ASSISTANT: Record<string, string> = {
  OpenAI: 'ChatGPT',
  GPTBot: 'ChatGPT',
  'ChatGPT-User': 'ChatGPT',
  'OAI-SearchBot': 'ChatGPT',
  Anthropic: 'Claude',
  ClaudeBot: 'Claude',
  'Claude-User': 'Claude',
  'Claude-SearchBot': 'Claude',
  PerplexityBot: 'Perplexity',
  'Perplexity-User': 'Perplexity',
  Googlebot: 'Google',
}

/** The product people know a robot by; the robot's own name when it has none. */
export const assistantOfRobot = (name: string): string => ASSISTANT[name] ?? name

/** The answer or index robot that failed the most of its visits, if one failed half or more of at least 20. */
export function crawlCard(robots: Robot[]): Story | null {
  const worst = robots
    .filter((r) => (r.kind === 'answer' || r.kind === 'index') && r.hits >= MIN_HITS && (r.blocked + r.errors) / r.hits >= MIN_SHARE)
    .toSorted((a, b) => (b.blocked + b.errors) / b.hits - (a.blocked + a.errors) / a.hits || b.hits - a.hits)[0]
  if (!worst) return null
  const failed = worst.blocked + worst.errors
  const pct = Math.round((failed / worst.hits) * 100)
  const blocked = worst.blocked >= worst.errors
  return {
    key: 'crawlers',
    score: 73,
    bad: true,
    head: copy.crawlHead(assistantOfRobot(worst.name)),
    vis: {
      k: 'rcpt',
      rows: [
        { l: copy.crawlRowBlocked, a: fmtInt(worst.blocked), n: worst.blocked, neg: true },
        { l: copy.crawlRowBroken, a: fmtInt(worst.errors), n: worst.errors, neg: true },
        { l: copy.crawlRowOk, a: fmtInt(worst.hits - failed), n: worst.hits - failed },
      ],
    },
    why: blocked ? copy.crawlBlocked(pct, worst.name, worst.hits) : copy.crawlBroken(pct, worst.name, worst.hits),
    val: `${pct}%`,
    m: failed,
    u: 'visits',
    how: copy.crawlHow,
    ev: copy.crawlEv(worst.hits, worst.blocked, worst.errors),
    act: { k: 'link', t: copy.crawlAct, url: DOCS },
    deeper: { kind: 'table', tab: 'ai' },
  }
}
