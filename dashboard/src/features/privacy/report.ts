// The privacy report: the facts of one site, read from its real settings and
// modules, and nothing else. No wording of its own beyond copy.ts.
import type { PolicyInput } from '../../lib/policy'
import { policyText } from '../../lib/policy'
import { copy } from './copy'

/** The visitor cookie's name and its Max-Age in days (tracker/src/core.ts: 34560000 s). */
export const COOKIE = { name: 'trckable_vid', days: 400 }

export type Report = {
  settings: { label: string; value: string }[]
  collected: string[]
  notCollected: string[]
  modules: string[]
  where: string
  banner: string
  policy: string
}

const onOff = (b: boolean) => (b ? copy.on : copy.off)

/** Which of the three answers about a banner this site gets. */
export function bannerKind(p: PolicyInput): 'free' | 'asks' | 'cookie' {
  if (p.config.consent_free) return 'free'
  return p.modules.consent ? 'asks' : 'cookie'
}

export function buildReport(p: PolicyInput): Report {
  const { config: c, modules: m } = p
  const free = c.consent_free
  const city = c.record_city && !free
  const s = copy.settings
  const days = c.retention_days
  const collected = [copy.collected.page, city ? copy.collected.city : copy.collected.country, copy.collected.device, copy.collected.time]
  const notCollected = [copy.notCollected.ip, copy.notCollected.crossSite, copy.notCollected.person]
  if (free) notCollected.push(copy.notCollected.cookieless)
  else notCollected.push(m.consent ? copy.notCollected.cookieAsk(COOKIE.name, COOKIE.days) : copy.notCollected.cookie(COOKIE.name, COOKIE.days))
  return {
    settings: [
      { label: s.cookieless, value: onOff(free) },
      { label: s.consent, value: onOff(m.consent) },
      { label: s.retention, value: days ? s.keepDays(days) : s.keepAll },
      { label: s.paths, value: s.count(c.exclude_paths?.length ?? 0) },
      { label: s.ips, value: s.count(c.exclude_ips?.length ?? 0) },
      { label: s.dnt, value: onOff(c.honor_dnt || free) },
    ],
    collected,
    notCollected,
    modules: Object.keys(copy.adds)
      .filter((id) => m[id])
      .map((id) => copy.adds[id as keyof typeof copy.adds]),
    where: copy.where,
    banner: copy.banner[bannerKind(p)],
    policy: policyText(p),
  }
}
