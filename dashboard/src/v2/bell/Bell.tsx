// The bell: the list of notices, which of them are read, and where a tap on one goes.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { Milestone, Site } from '../../lib/api'
import { lazyLoad } from '../../lib/lazyLoad'
import { dayWords } from '../dayWords'
import { mentionsPath } from '../../features/mentions/route'
import { navigate } from '../../lib/url'
import { openSettings } from '../../lib/settings'
import { BellMenu, type BellRow } from '../ui/BellMenu'
import { copy } from './copy'
import { badge, rowsOf, settle, unreadCount, type Notice, type NoticeRow } from './notices'
import { useBellAlert } from './useBellAlert'
import { OPEN_GAP_MS, type useNotices } from './useNotices'

const MilestoneSheet = lazyLoad(() => import('./MilestoneSheet'))

/** A moment's date ("2026-10-18") and clock ("09:10") in a zone (the viewer's own when none is given). */
function parts(at: number, zone?: string): { day: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).formatToParts(new Date(at * 1000)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** "16:05" for today, "Thu 15 Oct 16:05" for another day: the viewer's day and clock, not UTC. `now` and `zone` are for tests. */
export function when(at: number, now = Date.now() / 1000, zone?: string): string {
  const d = parts(at, zone)
  return d.day === parts(now, zone).day ? d.time : `${dayWords(d.day)} ${d.time}`
}

function go(n: Notice) {
  const base = '/' + encodeURIComponent(n.site)
  if (n.kind === 'down' || n.kind === 'up') navigate(`${base}/incidents`)
  else if (n.kind === 'mention') navigate(mentionsPath(n.site))
  else navigate(`${base}?view=briefing&period=${n.kind === 'weekly' ? '7d' : 'today'}`)
}

const NONE: ReadonlySet<string> = new Set()

/**
 * The rows the menu draws. Shut, they are the list as it stands. Open, a change in the list behind them changes nothing the
 * person can see (see `settle`): a new row takes its place in the order, and `fresh` names the rows that just arrived.
 */
function useOpenRows(src: NoticeRow[], open: boolean, gone: ReadonlySet<string>) {
  const [state, setState] = useState({ src, open, gone, rows: src, fresh: NONE })
  if (state.src !== src || state.open !== open || state.gone !== gone) {
    const rows = open && state.open ? settle(state.rows, src, gone) : src
    const before = new Set(state.rows.map((r) => r.id))
    const fresh = open && state.open ? new Set(rows.filter((r) => !before.has(r.id)).map((r) => r.id)) : NONE
    setState({ src, open, gone, rows, fresh })
  }
  return state
}

export function Bell({ site, notices }: { site: Site | null; notices: ReturnType<typeof useNotices> }) {
  const { items, read, refresh, mark, markAll, can, dismiss, archive } = notices
  const [sheet, setSheet] = useState(() => window.matchMedia('(max-width: 600px)').matches)
  const [told, setTold] = useState<Milestone | null>(null)
  const [open, setOpen] = useState(false)
  // Rows put away while the menu is open leave it at once; the rest of a change waits for nothing and moves nothing.
  const [gone, setGone] = useState(NONE)
  const onOpenChange = useCallback((o: boolean) => {
    setOpen(o)
    if (!o) setGone(NONE)
  }, [])
  // The rows the menu lists, and the badge counted from those same rows (none counted until the whole list is there).
  const src = useMemo(() => rowsOf(items, read), [items, read])
  const { rows: listed, fresh } = useOpenRows(src, open, gone)
  const unread = notices.ready ? unreadCount(listed) : 0
  const shaking = useBellAlert(items, read, unread, open, notices.ready)
  useEffect(() => {
    if (open) refresh(OPEN_GAP_MS, true)
  }, [open, refresh])
  const warm = useCallback(() => refresh(OPEN_GAP_MS, true), [refresh])
  useEffect(() => {
    const q = window.matchMedia('(max-width: 600px)')
    const f = () => setSheet(q.matches)
    q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [])
  if (!can) return null
  const rows: BellRow[] = listed.map((n) => ({ id: n.id, kind: n.kind, title: n.title, sub: `${n.sub} · ${when(n.at)}`, unread: n.unread, dismissable: n.dismissable }))
  const old: BellRow[] = (archive?.items ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, sub: `${n.sub} · ${when(n.at)}`, unread: false }))
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
      none={copy.none}
      sheet={sheet}
      onPick={(id) => {
        mark(id)
        const n = listed.find((x) => x.id === id) ?? archive?.items.find((x) => x.id === id)
        n?.read?.()
        if (n?.milestone && site && n.site === site.domain) setTold(n.milestone)
        else if (n?.open) n.open()
        else if (n) go(n)
      }}
      onAll={markAll}
      onDismiss={
        dismiss &&
        ((id) => {
          setGone((g) => new Set(g).add(id))
          dismiss(id)
        })
      }
      archive={archive && { rows: old, load: archive.load, loading: archive.loading, words: archive.words }}
      onSettings={() => site && openSettings(site, 'alerts')}
    />
    {told && site && (
      <Suspense fallback={null}>
        <MilestoneSheet site={site} m={told} onClose={() => setTold(null)} />
      </Suspense>
    )}
    </>
  )
}
