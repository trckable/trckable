// Where a site is on its way to the first visit, read only from what the server found: no guessing.
import type { InstallCheck, Site } from '../../lib/api'
import type { CheckState } from './useInstallCheck'

export type Stage = 'waiting' | 'limited' | 'notfound' | 'wrongid' | 'unreachable' | 'blocked' | 'found' | 'arrived'

/** Days without a visit after which the screen says it is still waiting and offers to remove the site. */
export const STALE_DAYS = 3

/** What the server found at the last look: the result, or the one before while the next runs. */
export function lastOf(s: CheckState): InstallCheck | undefined {
  if (s.phase === 'done') return s.result
  return s.phase === 'idle' ? undefined : s.last
}

export function stageOf(s: CheckState, arrived: boolean): Stage {
  if (arrived) return 'arrived'
  if (s.phase === 'limited') return 'limited'
  const c = lastOf(s)
  if (!c) return 'waiting'
  if (c.error) return 'unreachable'
  if (c.found === 'other' || c.found === 'nosite') return 'wrongid'
  if (c.found !== 'site') return 'notfound'
  const st = c.script_status ?? 0
  return c.script && !(st >= 200 && st < 400) ? 'blocked' : 'found'
}

/** Whole days since the site was added, once there are enough of them; 0 before. */
export function staleDays(site: Pick<Site, 'created_at'>, now = Date.now()): number {
  if (!site.created_at) return 0
  const days = Math.floor((now / 1000 - site.created_at) / 86400)
  return days >= STALE_DAYS ? days : 0
}

/** The "Why?" list a stage has: what to look at when the code is missing, or when it is there and nothing arrives. */
export const whyOf = (stage: Stage): 'missing' | 'quiet' | null => {
  if (stage === 'notfound' || stage === 'wrongid' || stage === 'unreachable' || stage === 'blocked') return 'missing'
  return stage === 'found' ? 'quiet' : null
}
