// Every view is a URL: period, comparison, filters, mode and the scrubbed day
// live in the address bar, so any screen can be bookmarked or shared.
import { useSyncExternalStore } from 'react'
import type { Filter, FunnelStep } from './api'
import type { CompareMode } from './dates'
import { filterParam, parseFilterParam } from './filterSet'

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

/** The numbers the main chart can draw, besides visitors (its default). */
export const CHART_METRICS = ['pageviews', 'revenue', 'conversion', 'per-visitor', 'bounce', 'session'] as const
export type ChartMetricId = (typeof CHART_METRICS)[number]

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
  /** What the main chart shows; absent = visitors. */
  metric?: ChartMetricId
  /** Which visit a sale is credited to. Absent = last touch, what closed it. */
  attr?: 'first'
  /** Live mode: the site right now instead of the period's numbers. Absent
   *  in the address means the default (wantsLive, below); "data"
   *  is the person's choice of the period's numbers, kept when nothing else
   *  in the address would say so. */
  live?: boolean
  /** Full's funnel: its steps, in order ("fs=page:/pricing"). Absent = a suggested one. */
  funnel?: FunnelStep[]
  /** Data's two views: the story of the period, or all its numbers. 'story' or 'explore'; absent = the story, unless the address already narrows the numbers. */
  v?: string
  /** Explore opened from one of the story's answers: which, so the page can say so and lead back. */
  story?: string
}

/** Funnel steps from the address; anything but a page or a goal is dropped. */
function funnelOf(raw: string[]): FunnelStep[] | undefined {
  const steps: FunnelStep[] = []
  for (const r of raw.slice(0, 8)) {
    const i = r.indexOf(':')
    const kind = r.slice(0, i)
    if (i > 0 && (kind === 'page' || kind === 'goal')) steps.push({ kind, value: r.slice(i + 1) })
  }
  return steps.length ? steps : undefined
}

function liveOf(v: string | null): boolean | undefined {
  if (v === 'live') return true
  if (v === 'data') return false
  return undefined
}

/** A preset period compares with the one before unless the address says otherwise (compare=none); a custom range compares with nothing until asked. */
function compareOf(v: string | null, period: string): CompareMode {
  if (v === 'previous' || v === 'year' || v === 'custom' || v === 'none') return v
  return period === 'custom' ? 'none' : 'previous'
}

export function readView(params: URLSearchParams): ViewState {
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined
  const cmp = params.get('compare')
  return {
    period: from && to ? 'custom' : (params.get('period') ?? '30d'),
    from,
    to,
    compare: compareOf(cmp, from && to ? 'custom' : (params.get('period') ?? '30d')),
    cfrom: params.get('cfrom') ?? undefined,
    cto: params.get('cto') ?? undefined,
    filters: params.getAll('f').flatMap((f) => parseFilterParam(f) ?? []),
    // 'compact' was this mode's name until it became Core; links people
    // already shared keep working.
    mode: params.get('mode') === 'full' ? 'full' : 'core',
    bucket: (['hour', 'day', 'week', 'month'] as const).find((b) => b === params.get('bucket')),
    metric: CHART_METRICS.find((m) => m === params.get('metric')),
    day: params.get('day') ?? undefined,
    test: params.get('payments') === 'test',
    attr: params.get('attr') === 'first' ? 'first' : undefined,
    live: liveOf(params.get('view')),
    funnel: funnelOf(params.getAll('fs')),
    v: params.get('v')?.match(/^(story|explore)$/)?.[0],
    story: params.get('story')?.match(/^[a-z]{1,12}$/)?.[0],
  }
}

export function writeView(v: ViewState): string {
  const p = new URLSearchParams()
  if (v.live) p.set('view', 'live')
  if (v.period === 'custom' && v.from && v.to) {
    p.set('from', v.from)
    p.set('to', v.to)
  } else if (v.period !== '30d') p.set('period', v.period)
  // Only what differs from the default is written: "none" on a preset period, anything but "none" on a custom range.
  if (v.compare !== compareOf(null, v.from && v.to ? 'custom' : v.period)) p.set('compare', v.compare)
  if (v.compare === 'custom' && v.cfrom && v.cto) {
    p.set('cfrom', v.cfrom)
    p.set('cto', v.cto)
  }
  for (const f of v.filters) p.append('f', filterParam(f))
  if (v.mode === 'full') p.set('mode', 'full')
  if (v.bucket) p.set('bucket', v.bucket)
  if (v.metric) p.set('metric', v.metric)
  if (v.attr) p.set('attr', v.attr)
  if (v.day) p.set('day', v.day)
  if (v.test) p.set('payments', 'test')
  for (const s of v.funnel ?? []) p.append('fs', `${s.kind}:${s.value}`)
  if (v.v) p.set('v', v.v)
  if (v.story) p.set('story', v.story)
  // Data says so only when nothing else in the address does: a bare address
  // opens Live on a site with visits.
  if (v.live === false && p.size === 0) p.set('view', 'data')
  const s = p.toString()
  return s ? '?' + s : ''
}

// Which of Live and Data a dashboard opens in. A site that has had visits opens
// in Live when the address says nothing about the view: no ?view= and nothing
// else in it (a period, filters, Full, a day), which only Data has. A link with
// those, from a saved view or shared earlier, stays Data. A site with no visit
// yet keeps its install screen and Data.
export function wantsLive(view: ViewState, site: { last_event_at?: number }): boolean {
  if (view.live !== undefined) return view.live
  return !!site.last_event_at && writeView(view) === ''
}

/** Update part of the view; scrub moves replace history, everything else pushes. */
export function setView(patch: Partial<ViewState>) {
  const cur = readView(new URLSearchParams(location.search))
  // An address with a period, filters and so on is Data; if this change takes
  // the last of them out, it keeps saying Data.
  const data: Partial<ViewState> = cur.live === undefined && writeView(cur) !== '' ? { live: false } : {}
  const next = { ...cur, ...data, ...patch }
  navigate(location.pathname + writeView(next), { replace: Object.keys(patch).every((k) => k === 'day') })
}
