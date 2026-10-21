// The panel's filter: which kinds of notice it lists (All, Down, Busy, Milestones) and, with several sites, which site. The
// kinds are groups of the alerts a notice came from (alertState.alertOf), the one mapping. The choice is kept in this browser.
import { alertOf } from './alertState'
import type { AlertKind, Notice } from './notices'

export const GROUPS = ['all', 'down', 'busy', 'milestones'] as const
export type Group = (typeof GROUPS)[number]
export type Kind = Exclude<Group, 'all'>

/** The group of each alert: a site that stopped answering is Down; a busy moment or day is Busy; a number reached is a Milestone. */
const OF_ALERT: Partial<Record<AlertKind, Kind>> = { stopped: 'down', spike: 'busy', surge: 'busy', milestone: 'milestones', threshold: 'milestones' }

/** The group a notice belongs to, or none (a plan, a team, a mention: listed under All only). */
export function groupOf(n: Pick<Notice, 'kind' | 'alert' | 'members'>): Kind | undefined {
  if (n.members) return 'busy'
  const a = alertOf(n)
  return a && OF_ALERT[a]
}

export interface Filter {
  group: Group
  /** A site's domain, or '' for every site. */
  site: string
}
export const ALL: Filter = { group: 'all', site: '' }

const KEY = 'trckable.bell.filter'

export function readFilter(): Filter {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Filter> | null
    const group = GROUPS.find((g) => g === v?.group) ?? 'all'
    return { group, site: typeof v?.site === 'string' ? v.site.slice(0, 120) : '' }
  } catch {
    return ALL
  }
}

export function saveFilter(f: Filter): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // Not kept: the choice holds until the page is left.
  }
}

type Row = Pick<Notice, 'kind' | 'alert' | 'members' | 'site'> & { unread: boolean }
const onSite = (n: Row, site: string) => !site || n.site === site || !!n.members?.some((m) => m.site === site)

/** The rows a filter lists. */
export const apply = <T extends Row>(rows: readonly T[], f: Filter): T[] => rows.filter((n) => onSite(n, f.site) && (f.group === 'all' || groupOf(n) === f.group))

/** The groups that have an unread row (on the chosen site), so a chip says what the filter would show. */
export function unreadGroups(rows: readonly Row[], site: string): Set<Group> {
  const out = new Set<Group>()
  for (const n of rows) {
    if (!n.unread || !onSite(n, site)) continue
    out.add('all')
    const g = groupOf(n)
    if (g) out.add(g)
  }
  return out
}

/** Whether a row that is unread is hidden by the chosen site (the picker says so with a dot). */
export const hiddenUnread = (rows: readonly Row[], site: string): boolean => !!site && rows.some((n) => n.unread && !onSite(n, site))
