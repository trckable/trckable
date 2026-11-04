// The bell: the list of notices, which of them are read, and where a tap on one goes.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { Filter as ApiFilter, Milestone, Site } from '../../lib/api'
import { openExplore } from '../explore/open'
import { viewOf } from '../explore/thing'
import { lazyLoad } from '../../lib/lazyLoad'
import { signals } from '../../features/signals/copy'
import type { Surge } from '../../features/signals/surge'
import { mentionsPath } from '../../features/mentions/route'
import { navigate, readView, setView, writeView } from '../../lib/url'
import { openAccount } from '../../lib/account'
import { openSettings } from '../../lib/settings'
import { toast } from '../../components/Toast'
import { can as allowed } from '../../lib/permissions'
import { BellMenu, type BellRow, type RowAction } from '../ui/BellMenu'
import { brandOf } from '../../lib/brandIcons'
import { alertOf, setAlertOn } from './alertState'
import { copy } from './copy'
import { hasCard } from './eventModel'
import { timeOf, whenOf } from './days'
import { ALL, GROUPS, apply, readFilter, saveFilter, unreadGroups, type Filter } from './filter'
import { badge, rowsOf, settle, unreadCount, type Notice, type NoticeRow } from './notices'
import { useBellAlert } from './useBellAlert'
import { OPEN_GAP_MS, type useNotices } from './useNotices'
import { QUERY } from '../../kit/breakpoints'

const MilestoneSheet = lazyLoad(() => import('./MilestoneSheet'))
const EventCard = lazyLoad(() => import('./EventCard'))
const SurgeModal = lazyLoad(() => import('../../features/signals/SurgeModal'))

/** Explore on the row's site: opened in place when that site is in view, else its page is opened with Explore on. */
function exploreOn(n: Notice, site: Site | null, tab: Parameters<typeof openExplore>[0], filters?: ApiFilter[]) {
  if (site && site.domain === n.site) openExplore(tab, filters)
  else navigate(`/${encodeURIComponent(n.site)}${writeView({ ...readView(new URLSearchParams()), xp: tab, xf: filters })}`)
}

function go(n: Notice, site: Site | null, sites: Site[]) {
  const base = '/' + encodeURIComponent(n.site)
  const own = sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
  if (n.kind === 'sale') exploreOn(n, site, 'sales')
  else if (n.kind === 'signup' || n.kind === 'goal') exploreOn(n, site, 'overview')
  else if (n.kind === 'down' || n.kind === 'up') navigate(`${base}/incidents`)
  else if (n.kind === 'spike') navigate(`${base}?view=live`)
  else if (n.kind === 'answer') exploreOn(n, site, 'answers')
  else if (n.kind === 'setup' && own) openSettings(own, 'install')
  else if (n.kind === 'alert' && own) openSettings(own, 'alerts', n.alert ? { focus: `alert:${n.alert}` } : undefined)
  else if (n.kind === 'failed' && own) openSettings(own, 'payments')
  else if (n.kind === 'plan') openAccount('sites')
  else if (n.kind === 'team') openAccount('people')
  else if (n.kind === 'mention') navigate(mentionsPath(n.site))
  else navigate(`${base}?view=briefing&period=${n.kind === 'weekly' ? '7d' : 'today'}`)
}

/** A busy notice as the surge the story is told of: its numbers; the rest is read from what was stored (useFullSurge). */
function surgeOf(n: Notice): Surge {
  const { visitors, factor } = n.busy ?? { visitors: 0, factor: 0 }
  return { id: n.id, started: n.at, online: visitors, usual: factor > 0 ? visitors / factor : 0, times: factor, why: { source: n.source, source_dim: n.source ? 'referrer' : undefined, source_value: n.source, source_usual: 0, before: 0, minutes: 0 } }
}

/** The source as a person says it: the brand's name, else the host. */
const brandName = (host: string) => brandOf(host)?.name ?? host

const NONE: ReadonlySet<string> = new Set()

/**
 * The rows the menu draws. Shut, they are the list as it stands. Open, a change in the list behind them changes nothing the
 * person can see (see `settle`): a new row takes its place in the order, and `fresh` names the rows that just arrived.
 */
function useOpenRows(src: NoticeRow[], open: boolean, gone: ReadonlySet<string>) {
  const [state, setState] = useState({ src, open, gone, rows: src, fresh: NONE, lit: NONE })
  if (state.src !== src || state.open !== open || state.gone !== gone) {
    const live = open && state.open
    const rows = live ? settle(state.rows, src, gone) : src
    const before = new Set(state.rows.map((r) => r.id))
    const fresh = live ? new Set(rows.filter((r) => !before.has(r.id)).map((r) => r.id)) : NONE
    // Opening reads everything at once (the badge is clear for good); the dots of what was unread stay until it shuts.
    const lit = open ? new Set([...(live ? state.lit : NONE), ...src.filter((r) => r.unread && (!live || fresh.has(r.id))).map((r) => r.id)]) : NONE
    setState({ src, open, gone, rows, fresh, lit })
  }
  const rows = state.lit.size ? state.rows.map((r) => (state.lit.has(r.id) && !r.unread ? { ...r, unread: true } : r)) : state.rows
  // A row that was opened is read: its dot goes out at once.
  const unlight = (ids: string[]) => setState((s) => ({ ...s, lit: new Set([...s.lit].filter((id) => !ids.includes(id))) }))
  return { rows, fresh: state.fresh, unlight }
}

export function Bell({ site, notices }: { site: Site | null; notices: ReturnType<typeof useNotices> }) {
  const { items, read, refresh, mark, markAll, can, dismiss, archive } = notices
  const [sheet, setSheet] = useState(() => window.matchMedia(QUERY.xs).matches)
  const [told, setTold] = useState<{ m: Milestone; site: Site } | null>(null)
  const [busy, setBusy] = useState<Notice | null>(null)
  const [card, setCard] = useState<Notice | null>(null)
  const [open, setOpen] = useState(false)
  // Rows put away while the menu is open leave it at once; the rest of a change waits for nothing and moves nothing.
  const [gone, setGone] = useState(NONE)
  const onOpenChange = useCallback((o: boolean) => {
    setOpen(o)
    if (!o) setGone(NONE)
  }, [])
  // The rows the menu lists, and the badge counted from those same rows (none counted until the whole list is there).
  const src = useMemo(() => rowsOf(items, read), [items, read])
  const { rows: listed, fresh, unlight } = useOpenRows(src, open, gone)
  const [filter, setFilter] = useState<Filter>(readFilter)
  const choose = (f: Filter) => {
    setFilter(f)
    saveFilter(f)
  }
  const unread = notices.ready ? unreadCount(listed) : 0
  const shaking = useBellAlert(items, read, unread, open, notices.ready)
  useEffect(() => {
    if (open) refresh(OPEN_GAP_MS, true)
  }, [open, refresh])
  // An open panel has been seen: what is unread in it (and what arrives while it is open) is read at once, here first and
  // told to the server after, so no read of the list that is already on its way can bring the badge back.
  const hasUnread = notices.ready && src.some((r) => r.unread)
  useEffect(() => {
    if (open && hasUnread) markAll()
  }, [open, hasUnread, markAll])
  const warm = useCallback(() => refresh(OPEN_GAP_MS, true), [refresh])
  useEffect(() => {
    const q = window.matchMedia(QUERY.xs)
    const f = () => setSheet(q.matches)
    q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [])
  if (!can) return null
  const { sites } = notices
  /** Every notice put away at once (a row of several puts all of them away). */
  const away = (n: Notice) => {
    const all = n.members ?? [n]
    setGone((g) => new Set([...g, n.id, ...all.map((m) => m.id)]))
    all.forEach((m) => dismiss?.(m.id))
  }
  const mute = async (s: Site, kind: NonNullable<ReturnType<typeof alertOf>>) => {
    try {
      toast((await setAlertOn(s.id, kind, false)) === 'done' ? copy.muted(s.domain) : copy.mutedAlready(s.domain))
    } catch {
      toast(copy.mutedFailed, 'error')
    }
  }
  /** What the row's ⋯ offers. Mute and change are the alert's own settings, for whoever may change alerts; a row of several sites has none (it names no one site). */
  const actionsOf = (n: Notice, archived: boolean): RowAction[] => {
    const out: RowAction[] = []
    const s = n.members ? undefined : sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
    const kind = alertOf(n)
    if (s && kind && allowed('alert.manage')) {
      out.push({ key: 'mute', label: copy.mute, run: () => void mute(s, kind) }, { key: 'change', label: copy.change, run: () => openSettings(s, 'alerts', { focus: `alert:${kind}` }) })
    }
    if (n.dismissable && !archived && dismiss) out.push({ key: 'archive', label: copy.archive, run: () => away(n) })
    return out
  }
  /** What the row says of the time: nothing for a row of several, "All day" for what is kept by the day, else its span or its clock. */
  const whenOfRow = (n: Notice): string => {
    if (n.members) return ''
    return n.day ? copy.allDay : (n.when ?? timeOf(n.at, n.zone))
  }
  /** The row names its site when the person has several, unless its words already do. */
  const manySites = (n: Notice): boolean => !!n.site && sites.length > 1 && !n.title.includes(n.site) && !n.sub?.includes(n.site)
  const rowOf = (n: Notice & { unread: boolean }, archived: boolean): BellRow => ({
    id: n.id,
    kind: n.kind,
    at: n.at,
    title: n.title,
    sub: [n.sub, manySites(n) ? n.site : ''].filter(Boolean).join(' · '),
    time: whenOfRow(n),
    zone: n.zone ?? n.members?.[0]?.zone,
    unread: n.unread,
    bad: n.bad,
    source: n.source,
    label: n.source ? [n.title, n.sub, brandName(n.source), whenOfRow(n)].filter(Boolean).join(', ') : undefined,
    lines: n.members?.map((m) => ({ id: m.id, text: `${m.site} · ${timeOf(m.at, m.zone)}` })),
    actions: actionsOf(n, archived),
  })
  // A site the account no longer has is no filter.
  const siteKnown = !filter.site || sites.some((x) => x.domain === filter.site)
  const f = siteKnown ? filter : ALL
  const shown = apply(listed, f)
  const rows: BellRow[] = shown.map((n) => rowOf(n, false))
  const label: Record<(typeof GROUPS)[number], string> = { all: copy.filterAll, down: copy.filterDown, busy: copy.filterBusy, milestones: copy.filterMilestones }
  const dots = unreadGroups(listed, f.site)
  const old: BellRow[] = (archive?.items ?? []).map((n) => rowOf({ ...n, unread: false }, true))
  return (
    <>
    <BellMenu
      rows={rows}
      shaking={shaking}
      onOpenChange={onOpenChange}
      onWarm={warm}
      loading={!notices.ready}
      fresh={fresh}
      unread={unread}
      badge={badge(unread)}
      title={copy.title}
      markAll={copy.markAll}
      settings={copy.settings}
      none={copy.nothingHere}
      filter={{
        groups: GROUPS.map((g) => ({ id: g, label: label[g], on: f.group === g, dot: dots.has(g) })),
        onGroup: (g) => choose({ ...f, group: GROUPS.find((x) => x === g) ?? 'all' }),
        sites: sites.length > 1 ? [{ value: '', label: copy.allSites, on: !f.site }, ...sites.map((x) => ({ value: x.domain, label: x.domain, on: f.site === x.domain }))] : undefined,
        onSite: (site) => choose({ ...f, site }),
        active: [f.group === 'all' ? '' : label[f.group], f.site].filter(Boolean).join(' · '),
        onClear: () => choose(ALL),
      }}
      sheet={sheet}
      onPick={(id) => {
        // A row of several is read as one: opening any of its sites reads them all.
        const group = listed.find((x) => x.members?.some((m) => m.id === id))
        const n = (group?.members ?? [...listed, ...(archive?.items ?? [])]).find((x) => x.id === id)
        mark(group?.members ? group.members.map((m) => m.id) : id)
        unlight(group?.members ? [group.id, ...group.members.map((m) => m.id)] : [id])
        for (const m of group?.members ?? [n]) m?.read?.()
        const own = n && sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
        if (n?.milestone && own) setTold({ m: n.milestone, site: own })
        else if (n?.busy && !n.open) setBusy(n)
        else if (n?.open) n.open()
        else if (n && hasCard(n) && sites.some((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))) setCard(n)
        else if (n) go(n, site, sites)
      }}
      onAll={() => {
        markAll()
        unlight(listed.map((r) => r.id))
      }}
      archive={archive && { rows: old, load: archive.load, loading: archive.loading, none: archive.words.none }}
      onSettings={() => site && openSettings(site, 'alerts')}
    />
    {told && (
      <Suspense fallback={null}>
        <MilestoneSheet site={told.site} m={told.m} onClose={() => setTold(null)} />
      </Suspense>
    )}
    {card && <EventStory n={card} sites={sites} site={site} onClose={() => setCard(null)} />}
    {busy && <BusyStory n={busy} sites={sites} site={site} onClose={() => setBusy(null)} />}
    </>
  )
}

/** A busy row's story, with one way on: Explore on that site, at that time, narrowed to the source that sent them. */
function BusyStory({ n, sites, site, onClose }: { n: Notice; sites: Site[]; site: Site | null; onClose: () => void }) {
  const s = sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
  if (!s) return null
  const surge = surgeOf(n)
  const go = (patch: Parameters<typeof setView>[0]) => {
    if (site?.id === s.id) setView(patch)
    else navigate(`/${encodeURIComponent(s.domain)}${writeView({ ...readView(new URLSearchParams()), ...patch })}`)
  }
  return (
    <Suspense fallback={null}>
      <SurgeModal surge={surge} site={s.id} tz={s.timezone} head={signals.surge.busyHead(n.site, whenOf(n.at, undefined, s.timezone))} explore={{ filters: n.source ? [{ dim: 'referrer', value: n.source }] : [], go }} onClose={onClose} onSee={() => undefined} />
    </Suspense>
  )
}

/** A goal's or signup's card leads to that goal's report, over a period that holds the event. */
function seeGoal(n: Notice, goal: string, s: Site, site: Site | null) {
  const patch = viewOf({ kind: 'goal', value: goal }, { visit: { at: (n.exact ?? n.at) * 1000, tz: s.timezone } })
  if (site?.id === s.id) setView(patch)
  else navigate(`/${encodeURIComponent(s.domain)}${writeView({ ...readView(new URLSearchParams()), ...patch })}`)
}

/** A notice's own card, with one way on: the page the event lives on (where a tap on the row went before the card). */
function EventStory({ n, sites, site, onClose }: { n: Notice; sites: Site[]; site: Site | null; onClose: () => void }) {
  const s = sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
  if (!s) return null
  return (
    <Suspense fallback={null}>
      <EventCard
        n={n}
        site={s}
        onClose={onClose}
        onSee={() => {
          onClose()
          if (n.goal) seeGoal(n, n.goal, s, site)
          else go(n, site, sites)
        }}
      />
    </Suspense>
  )
}
