// The Mentions tab of the Sources card: where the site was talked about in the last 30 days, one compact
// row each: source mark, title, date and the visitors it brought. A chunk of its own, fetched when the tab opens.
import { ExternalLink } from 'lucide-react'
import { Skeleton } from '../../components/skeleton/Skeleton'
import type { Site } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { dateOf, safeURL } from './model'
import { SourceMark } from './SourceMark'
import { useMentions } from './useMentions'
import './mentions.css'

export default function MentionList({ site }: { site: Site }) {
  const got = useMentions(site.id, '30d')
  if (got.state === 'loading') return <Skeleton height={164} />
  if (got.state === 'failed') return null
  const { mentions } = got.data
  if (mentions.length === 0) return <p className="ml-empty">{copy.empty}</p>
  return (
    <ul className="ml-list">
      {mentions.map((m) => {
        const href = safeURL(m.url)
        const title = m.title || copy.name[m.source]
        return (
          <li key={m.id} className="ml-row">
            <SourceMark source={m.source} />
            {href ? (
              <a className="ml-title" href={href} target="_blank" rel="noopener noreferrer nofollow" aria-label={copy.open(title)} title={title}>
                <span>{title}</span>
                <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
              </a>
            ) : (
              <span className="ml-title" title={title}>
                {title}
              </span>
            )}
            <span className="ml-date faint">{dateOf(m.posted_at)}</span>
            <strong className="ml-n num" title={m.visitors > 0 ? copy.brought(m.visitors) : copy.noneYet}>
              {m.visitors > 0 ? fmtInt(m.visitors) : '–'}
            </strong>
          </li>
        )
      })}
    </ul>
  )
}
