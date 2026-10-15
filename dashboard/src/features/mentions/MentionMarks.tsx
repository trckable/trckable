// Where a mention was posted, on the main chart: a small dot on the bucket it fell in (with a count when
// several share it). Pointing at one lists them, each as source mark, title and the visitors it brought;
// a click opens the mention's link, or for several keeps the list open to pick from. Nothing is drawn,
// and the chart's chunk asks for nothing more, for a site with no mentions.
import { useEffect, useId, useMemo, useState } from 'react'
import type { Bucket, Site } from '../../lib/api'
import { useNow } from '../incidents/useIncidents'
import { bucketFor } from '../incidents/IncidentMarks'
import type { ChartGeo } from '../moments/marks'
import type { Mention, Period } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { safeURL } from './model'
import { SourceMark } from './SourceMark'
import { useMentions } from './useMentions'
import './page.css'

const TIP_W = 300
const DAY = 86400
const LISTED = 4

/** The shortest period the server offers that reaches back to the chart's first day. */
function periodFor(labels: string[], now: number): Period {
  const days = labels.length ? (now - Date.parse(labels[0].slice(0, 10)) / 1000) / DAY : 0
  if (days <= 30) return '30d'
  return days <= 90 ? '90d' : '1y'
}

const titleOf = (m: Mention) => m.title || copy.name[m.source]

/** The mentions of one bucket, as rows: source mark, title (cut short), visitors. */
function Rows({ list, links }: { list: Mention[]; links?: boolean }) {
  return (
    <ul className="mp-tiplist">
      {list.slice(0, links ? list.length : LISTED).map((m) => {
        const href = safeURL(m.url)
        const row = (
          <>
            <SourceMark source={m.source} />
            <span className="mp-tiptitle">{titleOf(m)}</span>
            <span className="faint num">{page.visitors(m.visitors)}</span>
          </>
        )
        return (
          <li key={m.id}>
            {links && href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" aria-label={copy.open(titleOf(m))}>
                {row}
              </a>
            ) : (
              <span>{row}</span>
            )}
          </li>
        )
      })}
      {!links && list.length > LISTED && <li className="faint">{copy.more(list.length - LISTED)}</li>}
    </ul>
  )
}

export default function MentionMarks({ g, site, labels, bucket }: { g: ChartGeo; site: Site; labels: string[]; bucket: Bucket }) {
  const now = useNow()
  const got = useMentions(site.id, periodFor(labels, now), 0, !!site.mentions)
  const marks = useMemo(() => {
    const list = got.state === 'ready' ? got.data.mentions : []
    const by = new Map<number, Mention[]>()
    for (const m of list) {
      const i = bucketFor({ started_at: m.posted_at }, labels, bucket, site.timezone)
      if (i >= 0) by.set(i, [...(by.get(i) ?? []), m].sort((a, b) => b.visitors - a.visitors))
    }
    return [...by].sort((a, b) => a[0] - b[0])
  }, [got, labels, bucket, site.timezone])
  const [shown, setShown] = useState<number | null>(null)
  const [kept, setKept] = useState<number | null>(null)
  const id = useId()
  const at = marks.find(([i]) => i === (kept ?? shown))
  const top = g.y(0) - 24
  useEffect(() => {
    if (kept === null) return
    const away = (e: PointerEvent) => !(e.target as Element).closest?.('.mp-tip, .mp-pin') && setKept(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setKept(null)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [kept])
  if (!marks.length) return null
  const click = (i: number, list: Mention[]) => {
    const href = list.length === 1 ? safeURL(list[0].url) : undefined
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
    else setKept(kept === i ? null : i)
  }
  return (
    <div role="group" aria-label={page.pinsGroup}>
      {marks.map(([i, list]) => (
        <button
          key={i}
          type="button"
          className={'mp-pin' + (list.length > 1 ? ' many' : '')}
          style={{ left: `clamp(11px, ${g.x(i)}px, calc(100% - 11px))`, top }}
          aria-label={list.length > 1 ? page.pinMany(list.length) : page.pin(titleOf(list[0]), list[0].visitors)}
          aria-describedby={at?.[0] === i ? id : undefined}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => setShown(i)}
          onPointerLeave={() => setShown(null)}
          onFocus={() => setShown(i)}
          onBlur={() => setShown(null)}
          onClick={() => click(i, list)}
        >
          <span className="mp-dot num" aria-hidden="true">
            {list.length > 1 ? list.length : ''}
          </span>
        </button>
      ))}
      {at && (
        <div id={id} role="tooltip" className={'mp-tip' + (kept === at[0] ? ' kept' : '')} style={{ left: Math.max(4, Math.min(g.x(at[0]) - TIP_W / 2, g.w - TIP_W - 4)), top: top - 8, width: TIP_W }}>
          <Rows list={at[1]} links={kept === at[0]} />
        </div>
      )}
    </div>
  )
}
