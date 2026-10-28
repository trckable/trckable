// The setup checklist for the dev fixture: a shop part-way through, with skips, "That's right" and the kind kept in memory.
import type { SetupItem, SetupState, SiteKind } from '../../lib/apiMore'

const skipped = new Set<string>()
const state = { kind: 'shop' as SiteKind, chosen: false, locale: false }

const core = (id: string, done: boolean, detail?: SetupItem['detail']): SetupItem => ({ id, group: 'core', done, counted: true, skipped: false, skippable: false, detail })
const opt = (id: string, done: boolean, detail?: SetupItem['detail']): SetupItem => {
  const off = skipped.has(id) || (state.kind === 'content' && id === 'payments' && !skipped.has('!' + id))
  return { id, group: off ? 'more' : 'optional', done, counted: !off, skipped: off, skippable: true, detail }
}
const extra = (id: string, done: boolean, detail?: SetupItem['detail']): SetupItem => ({ id, group: 'more', done, counted: false, skipped: false, skippable: false, detail })

const GOALS: Record<SiteKind, string> = { shop: 'Purchase', saas: 'Sign-up', content: 'Newsletter sign-up', other: '' }

export function setupOf(): SetupState {
  const items = [
    core('verified', true, { pages: 14 }),
    core('locale', state.locale, { timezone: 'Europe/Berlin', currency: 'EUR' }),
    core('goal', false, { suggestion: GOALS[state.kind] }),
    opt('payments', false, { provider: 'stripe' }),
    opt('funnel', false),
    opt('search', true),
    opt('crawlers', true),
    opt('proxy', true, { last_seen: 1760000000 }),
    extra('own_visits', false),
    extra('vitals', false, { bytes: 1130 }),
    extra('heatmaps', false),
    extra('ga', false),
    extra('team', false),
    extra('phone', false),
    extra('mentions', false),
  ]
  const counted = items.filter((i) => i.counted)
  const done = counted.filter((i) => i.done).length
  return { kind: { value: state.kind, chosen: state.chosen, provider: 'stripe' }, goal_suggestion: GOALS[state.kind], done, counted: counted.length, all_set: counted.length > 0 && done === counted.length, items }
}

/** A change to the checklist; answers with the new one. */
export function setupChange(method: string, path: string, body: unknown): SetupState | null {
  const skip = /\/setup\/skip\/(\w+)$/.exec(path)
  if (skip) {
    if (method === 'PUT') skipped.add(skip[1])
    else skipped.delete(skip[1])
    return setupOf()
  }
  if (path.endsWith('/setup/locale')) state.locale = true
  else if (path.endsWith('/setup/kind')) Object.assign(state, { kind: (body as { kind: SiteKind }).kind, chosen: true })
  else if (!path.endsWith('/setup/funnel')) return null
  return setupOf()
}
