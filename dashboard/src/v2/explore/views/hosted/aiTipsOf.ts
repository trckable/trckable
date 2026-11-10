// What the AI & Search reads out of the report, from the report alone: how many fetches an assistant's robots made for each
// visitor it sent, and the tips on how to improve, each one only when the numbers show it.
import type { AiSearchReport } from '../../../../lib/apiMore'

/** Broken-page requests by one company before they are worth a tip, and the share of its requests they must be. */
export const MIN_BROKEN = 20
export const BROKEN_SHARE = 0.05
/** An assistant's robots must have read this often, and sent at most one visitor per this many reads, to be called out. */
export const MIN_FETCHES = 500
export const FETCHES_PER_VISITOR = 500
/** Requests turned away by the server or CDN before they are worth a tip. */
export const MIN_BLOCKED = 20
/** Under this many fetches a ratio is noise, and with more visitors than fetches it says nothing: only the two numbers show. */
export const MIN_RATIO_FETCHES = 50
export const MAX_TIPS = 3
const SHOWN = 3

export type Return = { kind: 'none' } | { kind: 'nobody' } | { kind: 'per'; n: number }

/** Fetches per visitor sent: nothing to say without fetches (no robot data, or a robot that never came), "nobody" when it read and sent no one. */
export function returnPer(fetches: number | undefined, visitors: number): Return {
  if (!fetches || fetches <= 0) return { kind: 'none' }
  if (fetches < MIN_RATIO_FETCHES) return { kind: 'none' }
  if (visitors <= 0) return { kind: 'nobody' }
  if (visitors >= fetches) return { kind: 'none' }
  return { kind: 'per', n: Math.round(fetches / visitors) }
}

/** An assistant that reads a lot and credits little: the point where the ratio is worth a warning colour. */
export const lowReturn = (r: Return, fetches: number | undefined): boolean => (fetches ?? 0) >= MIN_FETCHES && (r.kind === 'nobody' || (r.kind === 'per' && r.n >= FETCHES_PER_VISITOR))

export type Tip =
  | { id: 'connect' }
  | { id: 'broken'; company: string; errors: number; pages: { path: string; n: number }[] }
  | { id: 'credit'; assistant: string; fetches: number; visitors: number; page?: string }
  | { id: 'blocked'; blocked: number; companies: string[] }
  | { id: 'unread'; count: number; pages: string[] }

/** The AI robots (answering and training) added up by company; the search engines' indexers are not AI's reading. */
function byCompany(rep: AiSearchReport) {
  const by = new Map<string, { hits: number; errors: number; blocked: number }>()
  for (const b of rep.bots) {
    if (b.kind === 'index') continue
    const e = by.get(b.name) ?? { hits: 0, errors: 0, blocked: 0 }
    by.set(b.name, { hits: e.hits + b.hits, errors: e.errors + (b.errors ?? 0), blocked: e.blocked + (b.blocked ?? 0) })
  }
  return by
}

/** At most MAX_TIPS, most useful first. Without crawler data there is one: to connect it (and nothing at all for someone who cannot). */
/** `filtered`: a dashboard filter is on, which narrows the visitors but not the robots, so no ratio of the two is told. */
export function tipsOf(rep: AiSearchReport, canConnect: boolean, filtered = false): Tip[] {
  if (rep.bots.length === 0) return canConnect ? [{ id: 'connect' }] : []
  const tips: Tip[] = []
  const companies = byCompany(rep)

  const broken = [...companies].filter(([, c]) => c.errors >= MIN_BROKEN && c.errors / c.hits >= BROKEN_SHARE).sort((a, b) => b[1].errors - a[1].errors || a[0].localeCompare(b[0]))[0]
  if (broken) {
    const pages = rep.pages.filter((p) => (p.errors ?? 0) > 0).sort((a, b) => (b.errors ?? 0) - (a.errors ?? 0)).slice(0, SHOWN)
    tips.push({ id: 'broken', company: broken[0], errors: broken[1].errors, pages: pages.map((p) => ({ path: p.path, n: p.errors ?? 0 })) })
  }

  const credit = filtered ? undefined : rep.assistants
    .filter((a) => a.company && (a.fetches ?? 0) >= MIN_FETCHES && a.visitors * FETCHES_PER_VISITOR <= (a.fetches ?? 0))
    .sort((a, b) => (b.fetches ?? 0) - (a.fetches ?? 0))[0]
  if (credit) {
    const read = (p: AiSearchReport['pages'][number]) => p.bots?.find((b) => b.name === credit.company)?.hits ?? 0
    const top = [...rep.pages].sort((a, b) => read(b) - read(a))[0]
    tips.push({ id: 'credit', assistant: credit.name, fetches: credit.fetches ?? 0, visitors: credit.visitors, page: top && read(top) > 0 ? top.path : undefined })
  }

  const blocked = [...companies].filter(([, c]) => c.blocked > 0).sort((a, b) => b[1].blocked - a[1].blocked || a[0].localeCompare(b[0]))
  const turned = blocked.reduce((n, [, c]) => n + c.blocked, 0)
  if (turned >= MIN_BLOCKED) tips.push({ id: 'blocked', blocked: turned, companies: blocked.slice(0, SHOWN).map(([name]) => name) })

  const unread = rep.pages.filter((p) => p.flag === 'unread')
  if (unread.length > 0) tips.push({ id: 'unread', count: unread.length, pages: unread.slice(0, SHOWN).map((p) => p.path) })

  return tips.slice(0, MAX_TIPS)
}
