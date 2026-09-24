// Every view is a URL: period, comparison, filters, mode and the scrubbed day
// live in the address bar, so any screen can be bookmarked or shared.
import { useSyncExternalStore } from 'react'
import type { Filter } from './api'
import type { CompareMode } from './dates'

const EVENT = 'trckable:navigate'

function subscribe(fn: () => void) {
  window.addEventListener('popstate', fn)
  window.addEventListener(EVENT, fn)
  return () => {
    window.removeEventListener('popstate', fn)
    window.removeEventListener(EVENT, fn)
  }
}

const snapshot = () => location.pathname + location.search

export function useLocation() {
  useSyncExternalStore(subscribe, snapshot)
  return { path: location.pathname, params: new URLSearchParams(location.search), hash: location.hash }
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === snapshot()) return
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', to)
  window.dispatchEvent(new Event(EVENT))
}

export interface ViewState {
  period: string // preset id, or "custom" when from/to are set
  from?: string
  to?: string
  compare: CompareMode
  cfrom?: string
  cto?: string
  filters: Filter[]
  mode: 'core' | 'full'
  day?: string // scrubbed day
  test?: boolean // show test/sandbox payments instead of live ones
  bucket?: 'hour' | 'day' | 'week' | 'month' // chosen granularity; absent = trckable picks
  /** Which visit a sale is credited to. Absent = last touch, what closed it. */
  attr?: 'first'
}

export function readView(params: URLSearchParams): ViewState {
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined
  const cmp = params.get('compare')
  return {
    period: from && to ? 'custom' : (params.get('period') ?? '30d'),
    from,
    to,
    compare: cmp === 'previous' || cmp === 'year' || cmp === 'custom' ? cmp : 'none',
    cfrom: params.get('cfrom') ?? undefined,
    cto: params.get('cto') ?? undefined,
    filters: params.getAll('f').flatMap((f) => {
      const i = f.indexOf(':')
      return i > 0 ? [{ dim: f.slice(0, i), value: f.slice(i + 1) }] : []
    }),
    // 'compact' was this mode's name until it became Core; links people
    // already shared keep working.
    mode: params.get('mode') === 'full' ? 'full' : 'core',
    bucket: (['hour', 'day', 'week', 'month'] as const).find((b) => b === params.get('bucket')),
    day: params.get('day') ?? undefined,
    test: params.get('payments') === 'test',
    attr: params.get('attr') === 'first' ? 'first' : undefined,
  }
}

export function writeView(v: ViewState): string {
  const p = new URLSearchParams()
  if (v.period === 'custom' && v.from && v.to) {
    p.set('from', v.from)
    p.set('to', v.to)
  } else if (v.period !== '30d') p.set('period', v.period)
  if (v.compare !== 'none') p.set('compare', v.compare)
  if (v.compare === 'custom' && v.cfrom && v.cto) {
    p.set('cfrom', v.cfrom)
    p.set('cto', v.cto)
  }
  for (const f of v.filters) p.append('f', `${f.dim}:${f.value}`)
  if (v.mode === 'full') p.set('mode', 'full')
  if (v.bucket) p.set('bucket', v.bucket)
  if (v.attr) p.set('attr', v.attr)
  if (v.day) p.set('day', v.day)
  if (v.test) p.set('payments', 'test')
  const s = p.toString()
  return s ? '?' + s : ''
}

/** Update part of the view; scrub moves replace history, everything else pushes. */
export function setView(patch: Partial<ViewState>) {
  const cur = readView(new URLSearchParams(location.search))
  const next = { ...cur, ...patch }
  navigate(location.pathname + writeView(next), { replace: Object.keys(patch).every((k) => k === 'day') })
}
