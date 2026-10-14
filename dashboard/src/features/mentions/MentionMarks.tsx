// Where a mention was posted, on the main chart: the source's small mark on the
// bucket it fell in. Pointing at one says what it was and how many people it
// brought; clicking opens it on the Mentions page. Nothing is drawn, and the
// chart's chunk asks for nothing more, for a site with no mentions.
import { useId, useMemo, useState } from 'react'
import type { Bucket, Site } from '../../lib/api'
import { navigate } from '../../lib/url'
import { useNow } from '../incidents/useIncidents'
import { bucketFor } from '../incidents/IncidentMarks'
import type { ChartGeo } from '../moments/marks'
import type { Mention, Period } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { mentionsPath } from './route'
import { SourceMark } from './SourceMark'
import { useMentions } from './useMentions'
import './page.css'

const TIP_W = 260
const DAY = 86400

/** The shortest period the server offers that reaches back to the chart's first day. */
function periodFor(labels: string[], now: number): Period {
  const days = labels.length ? (now - Date.parse(labels[0].slice(0, 10)) / 1000) / DAY : 0
  if (days <= 30) return '30d'
  return days <= 90 ? '90d' : '1y'
}

export default function MentionMarks({ g, site, labels, bucket }: { g: ChartGeo; site: Site; labels: string[]; bucket: Bucket }) {
  const now = useNow()
  const got = useMentions(site.id, periodFor(labels, now))
  const marks = useMemo(() => {
    const list = got.state === 'ready' ? got.data.mentions : []
    const by = new Map<number, Mention>()
    for (const m of list) {
      const i = bucketFor({ started_at: m.posted_at }, labels, bucket, site.timezone)
      const was = by.get(i)
      if (i >= 0 && (!was || m.visitors > was.visitors)) by.set(i, m)
    }
    return [...by].sort((a, b) => a[0] - b[0])
  }, [got, labels, bucket, site.timezone])
  const [shown, setShown] = useState<number | null>(null)
  const id = useId()
  const open = marks.find(([i]) => i === shown)
  const top = g.y(0) - 24
  if (!marks.length) return null
  return (
    <div role="group" aria-label={page.pinsGroup}>
      {marks.map(([i, m]) => (
        <button
          key={i}
          type="button"
          className="mp-pin"
          style={{ left: `clamp(11px, ${g.x(i)}px, calc(100% - 11px))`, top }}
          aria-label={page.pin(m.title || copy.name[m.source], m.visitors)}
          aria-describedby={shown === i ? id : undefined}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => setShown(i)}
          onPointerLeave={() => setShown(null)}
          onFocus={() => setShown(i)}
          onBlur={() => setShown(null)}
          onClick={() => navigate(`${mentionsPath(site.domain)}?m=${m.id}`)}
        >
          <SourceMark source={m.source} />
        </button>
      ))}
      {open && (
        <div id={id} role="tooltip" className="mp-tip" style={{ left: Math.max(4, Math.min(g.x(open[0]) - TIP_W / 2, g.w - TIP_W - 4)), top: top - 44, maxWidth: TIP_W }}>
          <strong>{open[1].title || copy.name[open[1].source]}</strong>
          <span className="faint"> · {page.visitors(open[1].visitors)}</span>
        </div>
      )}
    </div>
  )
}
