// Under the cards: where the site was talked about in the last 30 days, each
// with the visitors it brought. A lazy chunk of its own: the first load never
// carries any of it. Empty, it says what is watched and for which words.
import { useEffect, useRef, useState } from 'react'
import { openSettings } from '../../lib/settings'
import { isViewer } from '../../lib/me'
import type { Site } from '../../lib/api'
import { navigate } from '../../lib/url'
import { copy } from './copy'
import { page } from './pageCopy'
import { mentionsPath } from './route'
import { MentionRow } from './MentionRow'
import { placesOf, SHOWN } from './model'
import { useMentions } from './useMentions'
import './mentions.css'

export default function MentionsCard({ site }: { site: Site }) {
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
  const got = useMentions(site.id, '30d', 0, near)
  const [all, setAll] = useState(false)
  if (!near) return <div ref={mark} className="mentions-mark" aria-hidden="true" />
  if (got.state === 'loading') return null
  if (got.state === 'failed') return null // a hint under the page, never an error on it
  const { mentions, sources, words } = got.data
  const list = all ? mentions : mentions.slice(0, SHOWN)
  const searched = [...words.default, ...words.added]
  return (
    <section className="card mentions" aria-labelledby="mentions-h">
      <div className="card-head">
        <h2 id="mentions-h">{copy.title}</h2>
        <span className="mentions-period">{copy.period}</span>
        <button type="button" className="mentions-link" onClick={() => navigate(mentionsPath(site.domain))}>
          {page.all30}
        </button>
      </div>
      {mentions.length > 0 ? (
        <ul className="mention-list">
          {list.map((m) => (
            <MentionRow key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        <p className="mentions-empty">{copy.empty}</p>
      )}
      {mentions.length > SHOWN && (
        <button type="button" className="mentions-more" onClick={() => setAll(!all)}>
          {all ? copy.less : copy.more(mentions.length - SHOWN)}
        </button>
      )}
      <p className="mentions-watch">
        {copy.lookingOn(placesOf(sources))} {copy.searched}: {searched.join(', ')}.{' '}
        {!isViewer() && (
          <button type="button" className="mentions-link" onClick={() => openSettings(site, 'mentions')}>
            {copy.change}
          </button>
        )}
      </p>
    </section>
  )
}
