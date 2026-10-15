// Under the cards, beside Mentions: the three tagged links that brought the most
// in the period, each a mark, its tag, a bar and its visitors; a tap shows the
// dashboard for that link. A lazy chunk of its own, asked for only when the card
// is about to be seen. Before any tagged visit: one slim line with a sample link,
// which can be put away.
import { ChevronRight, Link2, Target, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Site } from '../../lib/api'
import { fmtCompact } from '../../lib/format'
import { navigate } from '../../lib/url'
import { sitePagePath } from '../../lib/sitePath'
import { RefMark } from '../cards/refIcons'
import { CopyButton } from '../sharelinks/CopyButton'
import type { Link } from './api'
import { copy } from './copy'
import { LinksTip } from './LinksTip'
import { barPct, sampleLink, topLinks } from './model'
import { useLinks } from './useLinks'
import './linksCard.css'

const HIDE_KEY = 'trckable:links-hint-off'

const hidden = (): boolean => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

function Row({ l, max, icon, goals, onOpen }: { l: Link; max: number; icon: boolean; goals: boolean; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="yc-row" onClick={onOpen} aria-label={copy.open(l.value)}>
        <span className="yc-name">
          {l.dim === 'referrer' ? <RefMark host={l.value} icon={icon} /> : <span className="ref-mark ref-initial" aria-hidden="true">{l.value.charAt(0).toUpperCase()}</span>}
          <span className="yc-tag">{l.value}</span>
        </span>
        <span className="yc-bar" aria-hidden="true">
          <i style={{ width: `${barPct(l.visitors, max)}%` }} />
        </span>
        <span className="yc-n num" title={copy.visitorsOf(String(l.visitors))}>{fmtCompact(l.visitors)}</span>
        {goals && l.goals > 0 ? (
          <span className="yc-badge num" title={copy.goals(String(l.goals))}>
            <Target size={13} strokeWidth={1.75} aria-hidden="true" />
            {fmtCompact(l.goals)}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
      </button>
    </li>
  )
}

export default function LinksCard({ site, from, to, onPick }: { site: Site; from: string; to: string; onPick: (dim: string, value: string) => void }) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const mark = useRef<HTMLDivElement>(null)
  // Asked for only when the card is about to be seen: it is under the fold and never part of the first load.
  useEffect(() => {
    const el = mark.current
    if (near || !el) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  const { data, ready, failed, icons } = useLinks(site.id, from, to, near)
  const [off, setOff] = useState(hidden)
  if (!near) return <div ref={mark} className="yc-mark" aria-hidden="true" />
  if (!ready || failed || !data) return null // a hint under the page, never an error on it
  const rows = data.links
  if (rows.length === 0) {
    if (off) return null
    const link = sampleLink(site.domain)
    return (
      <section className="card yc-hint" aria-label={copy.title}>
        <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />
        <code className="num">{link}</code>
        <CopyButton icon text={'https://' + link} label={copy.copyLabel} toastText={copy.copied} />
        <LinksTip text={copy.emptyTip} align="right" />
        <button
          type="button"
          className="yc-x"
          aria-label={copy.dismiss}
          title={copy.dismiss}
          onClick={() => {
            try {
              localStorage.setItem(HIDE_KEY, '1')
            } catch {
              /* private mode: hidden for this visit only */
            }
            setOff(true)
          }}
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </section>
    )
  }
  const top = topLinks(rows)
  const max = Math.max(0, ...top.map((l) => l.visitors))
  return (
    <section className="card yc" aria-labelledby="yc-h">
      <div className="card-head">
        <h2 id="yc-h">{copy.title}</h2>
        <button type="button" className="yc-all" onClick={() => navigate(sitePagePath(site.domain, '/links', true))}>
          {copy.all}
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <ul className="yc-list">
        {top.map((l) => (
          <Row key={l.dim + ':' + l.value} l={l} max={max} icon={icons.has(l.value)} goals={data.goals} onOpen={() => onPick(l.dim, l.value)} />
        ))}
      </ul>
    </section>
  )
}
