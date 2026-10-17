import { ChevronRight, EyeOff, ExternalLink } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import type { Mention } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { agoOf, safeURL } from './model'
import { outletOf } from './pageModel'
import { SourceMark } from './SourceMark'
import { Spark } from './Spark'
import { trust } from './trustCopy'

/** Who said it: the author's handle, or the outlet for a news item. */
function whoOf(m: Mention): string {
  if (m.author) return copy.by(m.author)
  return m.source === 'news' ? page.viaOutlet(outletOf(m)) : ''
}

/** The platform's own numbers, when it gave any. */
export function reachOf(m: Mention): string[] {
  const out: string[] = []
  if (m.front) out.push(copy.front)
  if (m.points && (m.source === 'hn' || m.source === 'ph')) out.push(copy.points[m.source](m.points))
  if (m.comments) out.push(page.comments(m.comments))
  return out
}

/** One mention as a card: where and when, its title, who said it, and the visitors it brought, big, with their curve. */
export function FeedRow({ m, curve, onOpen, onHide }: { m: Mention; curve?: number[]; onOpen: () => void; onHide?: () => void }) {
  const href = safeURL(m.url)
  const title = m.title || copy.name[m.source]
  return (
    <li className={'card mp-card' + (m.visitors === 0 ? ' quiet' : '')}>
      <div className="mp-card-top">
        <SourceMark source={m.source} />
        <span>{copy.name[m.source]}</span>
        <span className="mp-when">{agoOf(m.posted_at)}</span>
        {m.front && <span className="mp-tag">{copy.front}</span>}
        {m.via === 'page' && (
          <span className="mp-tag mp-confirmed" title={trust.confirmedTip}>
            {trust.confirmed(m.visitors)}
          </span>
        )}
        {onHide && (
          <button type="button" className="mp-go mp-hide" aria-label={trust.notAboutUs} title={trust.notAboutUs} onClick={onHide}>
            <EyeOff size={15} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="mp-go" aria-label={page.openDetail(title)} onClick={onOpen}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
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
      <p className="mp-facts">{whoOf(m)}</p>
      <div className="mp-impact" title={m.visitors > 0 ? copy.brought(m.visitors) : copy.noneYet}>
        <Spark values={curve ?? []} w={96} h={28} />
        <p className="mp-num">
          <strong>{m.visitors > 0 ? fmtInt(m.visitors) : '–'}</strong>
          <span>{copy.visitorsLabel}</span>
        </p>
      </div>
    </li>
  )
}
