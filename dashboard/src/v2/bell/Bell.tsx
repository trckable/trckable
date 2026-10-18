// The bell: the list of notices, which of them are read, and where a tap on one goes.
import { Suspense, useEffect, useState } from 'react'
import type { Milestone, Site } from '../../lib/api'
import { lazyLoad } from '../../lib/lazyLoad'
import { dayWords } from '../dayWords'
import { mentionsPath } from '../../features/mentions/route'
import { navigate } from '../../lib/url'
import { openSettings } from '../../lib/settings'
import { BellMenu, type BellRow } from '../ui/BellMenu'
import { copy } from './copy'
import { badge, type Notice } from './notices'
import { useBellAlert } from './useBellAlert'
import type { useNotices } from './useNotices'

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

export function Bell({ site, notices }: { site: Site | null; notices: ReturnType<typeof useNotices> }) {
  const { items, read, unread, mark, markAll, can, dismiss, archive } = notices
  const [sheet, setSheet] = useState(false)
  const [told, setTold] = useState<Milestone | null>(null)
  const [open, setOpen] = useState(false)
  const shaking = useBellAlert(items, read, unread, open, notices.ready)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 600px)')
    const f = () => setSheet(q.matches)
    f()
    q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [])
  if (!can) return null
  const rows: BellRow[] = items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, sub: `${n.sub} · ${when(n.at)}`, unread: !n.seen && !read.has(n.id), dismissable: n.dismissable }))
  const old: BellRow[] = (archive?.items ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, sub: `${n.sub} · ${when(n.at)}`, unread: false }))
  return (
    <>
    <BellMenu
      rows={rows}
      shaking={shaking}
      onOpenChange={setOpen}
      unread={unread}
      badge={badge(unread)}
      title={copy.title}
      markAll={copy.markAll}
      settings={copy.settings}
      none={copy.none}
      sheet={sheet}
      onPick={(id) => {
        mark(id)
        const n = items.find((x) => x.id === id) ?? archive?.items.find((x) => x.id === id)
        n?.read?.()
        if (n?.milestone && site && n.site === site.domain) setTold(n.milestone)
        else if (n?.open) n.open()
        else if (n) go(n)
      }}
      onAll={markAll}
      onDismiss={dismiss}
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
