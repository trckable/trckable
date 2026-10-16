// Mentions: where the site is talked about, newest first.
import { useEffect, useState } from 'react'
import type { Site } from '../../../lib/api'
import { fmtInt } from '../../../lib/format'
import { mentionsApi, type Mention } from '../../../features/mentions/api'
import { copy } from '../copy'
import { XCols, XEmpty, XNote, type ColRow } from '../ui'

const when = (at: number) => {
  const d = new Date(at * 1000).toISOString()
  return d.slice(0, 10) === new Date().toISOString().slice(0, 10) ? d.slice(11, 16) : `${d.slice(5, 10)} ${d.slice(11, 16)}`
}
const NAMES: Record<string, string> = { hn: 'Hacker News', ph: 'Product Hunt' }
const source = (m: Mention) => NAMES[m.source] ?? m.host

export function Mentions({ site, limit, onAll }: { site: Site; limit: number; onAll: () => void }) {
  const [list, setList] = useState<Mention[] | null>(null)
  useEffect(() => {
    let live = true
    void mentionsApi.list(site.id, '90d').then((r) => live && setList(r.mentions), () => live && setList([]))
    return () => {
      live = false
    }
  }, [site.id])
  if (!list) return null
  if (!list.length) return <XEmpty title={copy.mentionsNone} sub={copy.mentionsNoneSub} />
  const rows: ColRow[] = [...list]
    .sort((a, b) => b.posted_at - a.posted_at)
    .map((m) => ({
      key: String(m.id),
      a: (
        <>
          <b className="mtt">{m.title}</b>
          <small>
            <span className="ms">{source(m)}</span>
            <span className="ph"> &middot; {when(m.posted_at)}</span>
          </small>
        </>
      ),
      c: [m.points ?? 0, m.comments ?? 0, when(m.posted_at)].map((x) => (typeof x === 'number' ? fmtInt(x) : x)),
    }))
  return (
    <>
      <XCols first={copy.mention} cols={[{ h: copy.points }, { h: copy.comments, m: true }, { h: copy.when, m: true }]} rows={rows} xc="minmax(0,1fr) 56px 76px 92px" xcm="minmax(0,1fr) 52px" limit={limit} showAll={copy.showAll} onAll={onAll} />
      <XNote>{copy.mentionsNote(site.domain)}</XNote>
    </>
  )
}
