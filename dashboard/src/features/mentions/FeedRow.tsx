import { ChevronRight, ExternalLink } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import type { Mention } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { agoOf, safeURL } from './model'
import { outletOf } from './pageModel'
import { Quote } from './Quote'
import { SourceMark } from './SourceMark'
import { Spark } from './Spark'

/** Who said it: the author's handle, or the outlet for a news item. */
function whoOf(m: Mention): string {
  if (m.author) return copy.by(m.author)
  return m.source === 'news' ? page.viaOutlet(outletOf(m)) : ''
}

/** The platform's own numbers, when it gave any. */
export function reachOf(m: Mention): string[] {
  const out: string[] = []
  if (m.front) out.push(copy.front)
  if (m.points && m.source !== 'news') out.push(copy.points[m.source](m.points))
  if (m.comments) out.push(page.comments(m.comments))
  return out
}

/** One mention in the feed: where, who, when, what was said, and what it brought. */
export function FeedRow({ m, words, curve, onOpen }: { m: Mention; words: string[]; curve?: number[]; onOpen: () => void }) {
  const href = safeURL(m.url)
  const title = m.title || copy.name[m.source]
  const facts = [copy.name[m.source], whoOf(m), agoOf(m.posted_at), ...reachOf(m)].filter(Boolean)
  return (
    <li className={'mp-row' + (m.visitors === 0 ? ' quiet' : '')}>
      <SourceMark source={m.source} />
      <div className="mp-main">
        <p className="mp-title">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" aria-label={copy.open(title)}>
              <span>{title}</span>
              <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
            </a>
          ) : (
            title
          )}
        </p>
        <p className="mp-facts">{facts.join(' · ')}</p>
        {m.snippet && <Quote text={m.snippet} words={words} />}
      </div>
      <div className="mp-impact" title={m.visitors > 0 ? copy.brought(m.visitors) : copy.noneYet}>
        <Spark values={curve ?? []} />
        <p className="mp-num">
          <strong>{m.visitors > 0 ? fmtInt(m.visitors) : '–'}</strong>
          <span>{copy.visitorsLabel}</span>
        </p>
      </div>
      <button type="button" className="mp-go" aria-label={page.openDetail(title)} onClick={onOpen}>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </li>
  )
}
