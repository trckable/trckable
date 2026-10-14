import { ExternalLink } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import type { Mention } from './api'
import { copy } from './copy'
import { factsOf, safeURL } from './model'
import { SourceMark } from './SourceMark'

/** One mention: where, what it said, when, and what it brought. */
export function MentionRow({ m }: { m: Mention }) {
  const href = safeURL(m.url)
  const title = m.title || copy.name[m.source]
  return (
    <li className="mention-row">
      <SourceMark source={m.source} />
      <div className="mention-body">
        <p className="mention-title">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" aria-label={copy.open(title)}>
              <span>{title}</span>
              <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
            </a>
          ) : (
            title
          )}
        </p>
        <p className="mention-facts">
          {copy.name[m.source]} · {factsOf(m).join(' · ')}
        </p>
      </div>
      <p className="mention-brought" title={m.visitors > 0 ? copy.brought(m.visitors) : copy.noneYet}>
        <strong>{m.visitors > 0 ? fmtInt(m.visitors) : '–'}</strong>
        <span>{copy.visitorsLabel}</span>
      </p>
    </li>
  )
}
