// Explore: the full numbers, over the page. Which table, what it is narrowed by, and what each says all come from
// the report; the page behind keeps its own filters unless this panel is closed after changing them.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '../../components/Toast'
import type { Filter, Site } from '../../lib/api'
import { type Range } from '../../lib/dates'
import { countryName } from '../../lib/format'
import { sameFilter } from '../../lib/filterSet'
import { isShared } from '../../lib/me'
import { setView, type ViewState } from '../../lib/url'
import { sourceName } from '../briefing/model'
import { say } from '../ui/toast'
import { Body } from './Body'
import { copy } from './copy'
import { Panel } from './Panel'
import { isTab, sectionOf, TABS, type Section, type Tab } from './sections'
import { Rail } from './Rail'
import { Toolbar, type MenuKey } from './Toolbar'
import { useReport } from './useData'
import { filtersOfQuery, queryOfFilters, useViews } from './useViews'
import { XSkeleton } from './ui'

const LS_FULL = 'trckable:xfull'
const LS_RAIL = 'trckable:xrail'
const get = (k: string) => {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}
const put = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? '1' : '0')
  } catch {
    /* a blocked store only forgets */
  }
}

const SKELETON: Partial<Record<Tab, number>> = { overview: 4, search: 4, speed: 3 }
const DIMS = ['referrer', 'page', 'country', 'device'] as const
const NAME: Record<string, (v: string) => string> = { referrer: (v) => sourceName(v) || v || '(direct)', country: countryName }

export function ExploreView({ site, view, range, label, money, onGoal }: { site: Site; view: ViewState; range: Range; label: string; money?: (minor: number) => string; onGoal: () => void }) {
  const tab: Tab = isTab(view.xp) ? view.xp : 'overview'
  const section = sectionOf(tab)
  const filters = view.xf ?? view.filters
  const comparing = typeof location !== 'undefined' && new URLSearchParams(location.search).has('compare') && view.compare !== 'none'
  const [menu, setMenu] = useState<MenuKey | null>(null)
  const [dim, setDim] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [limit, setLimit] = useState(12)
  const [full, setFull] = useState(() => get(LS_FULL))
  const [rail, setRail] = useState(() => get(LS_RAIL))
  const [canFull, setCanFull] = useState(() => window.innerWidth > 700)
  useEffect(() => {
    const f = () => setCanFull(window.innerWidth > 700)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const { answer, loading } = useReport(site, range, filters, comparing, true)
  const views = useViews(site)
  const setFilters = useCallback((next: Filter[]) => setView({ xf: next }), [])
  const toggle = (d: string, v: string) => {
    const has = filters.some((f) => sameFilter(f, { dim: d, value: v }))
    setFilters([...filters.filter((f) => f.dim !== d), ...(has ? [] : [{ dim: d, value: v }])])
    setLimit(12)
  }
  const close = () => setView({ xp: undefined, xf: undefined, filters: view.xf ? view.xf : view.filters })
  const go = (t: Tab) => {
    setView({ xp: t, xf: filters })
    setMenu(null)
    setLimit(12)
  }
  const onSection = (s: Section) => go(TABS[s].includes(tab) ? tab : TABS[s][0])
  const chips = filters.map((f) => ({ dim: f.dim, label: copy.dims[f.dim as keyof typeof copy.dims] ?? f.dim, value: (NAME[f.dim] ?? ((v: string) => v))(f.value) }))
  const values = useMemo(() => (dim && answer ? (answer.cur.dims[dim] ?? []).slice(0, 30).map((r) => ({ value: r.value, name: (NAME[dim] ?? ((v: string) => v))(r.value), on: filters.some((f) => sameFilter(f, { dim, value: r.value })) })) : []), [dim, answer, filters])
  const day = !comparing && (range.from === range.to) ? range.to : null
  const sub = `${site.name || site.domain} · ${label}`
  const sales = !money
  const toolbar = (
    <Toolbar
      tab={tab}
      section={section}
      menu={menu}
      onMenu={(m) => {
        setMenu(m)
        setDim(null)
        setManaging(false)
      }}
      connect={{ sales }}
      onSection={onSection}
      onTab={go}
      chips={chips}
      onRemove={(d) => setFilters(filters.filter((f) => f.dim !== d))}
      onClear={() => setFilters([])}
      dim={dim}
      onDim={setDim}
      dims={DIMS.map((d) => ({ id: d, label: copy.dims[d], now: filters.find((f) => f.dim === d) ? (NAME[d] ?? ((v: string) => v))(filters.find((f) => f.dim === d)?.value ?? '') : null }))}
      values={values}
      onValue={(d, v) => {
        toggle(d, v)
        setMenu(null)
        setDim(null)
      }}
      views={views.list.map((v) => ({ name: v.name }))}
      managing={managing}
      onManage={() => setManaging((m) => !m)}
      onView={(i) => {
        setFilters(filtersOfQuery(views.list[i].query))
        setMenu(null)
      }}
      onDeleteView={(i) => void views.remove(views.list[i].id)}
      onSave={() => {
        void views.save(chips.map((c) => c.value).join(' · '), filters).then(() => say(copy.viewSaved, copy.viewSavedSub))
        setMenu(null)
      }}
      pageDetails={tab === 'pages' ? (filters.find((f) => f.dim === 'page')?.value ?? null) : null}
      onPageDetails={() => setMenu(null)}
      onCsv={() => {
        setMenu(null)
        say(copy.csvReady, copy.csvSub, { icon: '↓' })
        const q = `from=${range.from}&to=${range.to}${queryOfFilters(filters) ? `&${queryOfFilters(filters)}` : ''}`
        window.open(`/api/v1/sites/${encodeURIComponent(site.id)}/export.csv?${q}`, '_blank', 'noopener')
      }}
      onLink={() => {
        setMenu(null)
        void navigator.clipboard?.writeText(location.href)
        toast(copy.linkCopied)
      }}
      searchOff={false}
    />
  )
  return (
    <Panel
      sub={sub}
      full={full}
      collapsed={rail}
      canFull={canFull && !isShared()}
      rail={<Rail section={section} collapsed={rail} connect={{ sales }} onSection={onSection} onToggle={() => { setRail(!rail); put(LS_RAIL, !rail) }} />}
      onFull={() => { setFull(!full); put(LS_FULL, !full) }}
      onClose={close}
      hasMenu={menu !== null}
      onShutMenu={() => { setMenu(null); setDim(null) }}
    >
      {toolbar}
      {loading && !answer ? (
        <XSkeleton cards={SKELETON[tab]} label={copy.loading} />
      ) : (
        <Body tab={tab} site={site} range={range} answer={answer} filters={filters} comparing={comparing} limit={limit} day={day} money={money} label={label} onPick={toggle} onAll={() => setLimit(9999)} onClear={() => setFilters([])} goTo={go} onGoal={onGoal} />
      )}
    </Panel>
  )
}
