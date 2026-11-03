// A mention: what was posted, where, and the link to it.
import { ExternalLink } from 'lucide-react'
import { eventCopy as t } from './eventCopy'
import type { Notice } from './notices'

/** Only a web address is made a link (the post's own address comes from the outside). */
const safe = (u: string | undefined): string | undefined => (u && /^https?:\/\//i.test(u) ? u : undefined)

export function EventMention({ n }: { n: Notice }) {
  const link = safe(n.link)
  return (
    <>
      <p className="ev-text">{n.sub}</p>
      {link && (
        <a className="ev-see" href={link} target="_blank" rel="noopener noreferrer">
          {t.openPost}
          <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
        </a>
      )}
    </>
  )
}
