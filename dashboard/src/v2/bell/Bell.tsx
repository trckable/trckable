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

/** "16:05" for today, "Thu 15 Oct 16:05" for another day. */
export function when(at: number): string {
  const d = new Date(at * 1000)
  const day = d.toISOString().slice(0, 10)
  const time = d.toISOString().slice(11, 16)
  return day === new Date().toISOString().slice(0, 10) ? time : `${dayWords(day)} ${time}`
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
